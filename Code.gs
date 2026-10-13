/**
 * Mood Compass — a three-check-in-a-day mood tracker that lives in this Google Sheet.
 *
 * One-time setup (see README.md for screenshots-free walkthrough):
 *   1. Paste this file + Index.html into Extensions → Apps Script.
 *   2. Run setup() once and approve permissions.
 *   3. Deploy → New deployment → Web app (Execute as: Me, Access: Only myself).
 *   4. Open the web app URL once on your phone and "Add to Home Screen".
 */

const CONFIG = {
  // Reminder times, 24h clock, in the spreadsheet's time zone (File → Settings).
  REMINDERS: { Morning: 9, Afternoon: 14, Evening: 20 },
  // Weekly summary email.
  WEEKLY_SUMMARY: { day: 'SUNDAY', hour: 19 },
  // Leave blank to send reminders to your own Google account.
  REMINDER_EMAIL: '',
};

const SLOTS = ['Morning', 'Afternoon', 'Evening'];
const SLOT_EMOJI = { Morning: '🌅', Afternoon: '🌤️', Evening: '🌙' };
const MOODS = {
  '2': { label: 'Manic', emoji: '⚡', color: '#d9480f' },
  '1': { label: 'Elevated', emoji: '☀️', color: '#e8a10c' },
  '0': { label: 'Balanced', emoji: '🌿', color: '#2f9e44' },
  '-1': { label: 'Low', emoji: '🌧️', color: '#4263eb' },
  '-2': { label: 'Depressed', emoji: '🌑', color: '#5f3dc4' },
};
const SHEET = 'Entries';
const HEADERS = ['Logged at', 'Date', 'Check-in', 'Mood', 'Score', 'Sleep (hrs)', 'Meds taken', 'Notes'];

/* ---------- Web app ---------- */

function doGet() {
  // Remember our own URL so reminder emails can link back here.
  const url = ScriptApp.getService().getUrl();
  if (url) PropertiesService.getScriptProperties().setProperty('APP_URL', url);
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Mood Compass')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('mobile-web-app-capable', 'yes')
    .addMetaTag('apple-mobile-web-app-capable', 'yes');
}

function getState() {
  const now = new Date();
  return {
    today: fmt_(now),
    hour: Number(fmt_(now, 'H')),
    entries: readEntries_(60).map(({ row, ...e }) => e),
  };
}

function saveEntry(e) {
  const score = Number(e && e.score);
  if (!MOODS[String(score)]) throw new Error('Please pick a mood.');
  if (!SLOTS.includes(e.slot)) throw new Error('Unknown check-in.');

  let sleep = e.sleep === '' || e.sleep == null ? '' : Number(e.sleep);
  if (sleep !== '') sleep = isNaN(sleep) ? '' : Math.max(0, Math.min(24, sleep));
  const meds = e.meds === true ? 'Yes' : e.meds === false ? 'No' : '';
  let notes = String(e.notes || '').slice(0, 2000);
  if (/^[=+\-@]/.test(notes)) notes = "'" + notes; // never let a note become a formula

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const today = fmt_(new Date());
    const row = [new Date(), today, e.slot, MOODS[String(score)].label, score, sleep, meds, notes];
    const existing = readEntries_(1).find(x => x.date === today && x.slot === e.slot);
    if (existing) sheet_().getRange(existing.row, 1, 1, row.length).setValues([row]);
    else sheet_().appendRow(row);
  } finally {
    lock.releaseLock();
  }
  return getState();
}

/* ---------- One-time setup ---------- */

function setup() {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();

  const sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET, 0);
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setFontWeight('bold').setBackground('#1f2a44').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.getRange('A2:A').setNumberFormat('yyyy-mm-dd hh:mm');
  sh.getRange('B2:B').setNumberFormat('yyyy-mm-dd');
  sh.setColumnWidth(1, 140);
  sh.setColumnWidth(8, 420);
  sh.getRange('H2:H').setWrap(true);
  const moodRange = sh.getRange('D2:D');
  sh.setConditionalFormatRules(Object.values(MOODS).map(m =>
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(m.label).setBackground(m.color).setFontColor('#ffffff')
      .setRanges([moodRange]).build()));

  // Daily roll-up + chart, recalculated live by Sheets.
  const daily = ss.getSheetByName('Daily') || ss.insertSheet('Daily');
  daily.clear();
  daily.getCharts().forEach(c => daily.removeChart(c));
  daily.getRange('A1').setFormula(
    "=QUERY(Entries!B:E,\"select B, avg(E), min(E), max(E), count(E) where B is not null " +
    "group by B order by B label avg(E) 'Average', min(E) 'Lowest', max(E) 'Highest', count(E) 'Check-ins'\",1)");
  daily.getRange('A2:A').setNumberFormat('yyyy-mm-dd');
  daily.getRange('B2:B').setNumberFormat('0.0');
  daily.insertChart(daily.newChart().asLineChart()
    .addRange(daily.getRange('A1:D400')).setNumHeaders(1)
    .setPosition(1, 7, 0, 0)
    .setOption('title', 'Daily mood  (−2 Depressed · 0 Balanced · +2 Manic)')
    .setOption('vAxes', { 0: { viewWindow: { min: -2, max: 2 } } })
    .setOption('colors', ['#1f2a44', '#4263eb', '#d9480f'])
    .setOption('width', 800).setOption('height', 360)
    .build());

  // Reminders (removes this project's old triggers first so re-running is safe).
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  Object.entries(CONFIG.REMINDERS).forEach(([slot, hour]) =>
    ScriptApp.newTrigger('remind' + slot).timeBased()
      .everyDays(1).atHour(hour).nearMinute(0).inTimezone(tz).create());
  ScriptApp.newTrigger('weeklySummary').timeBased()
    .onWeekDay(ScriptApp.WeekDay[CONFIG.WEEKLY_SUMMARY.day])
    .atHour(CONFIG.WEEKLY_SUMMARY.hour).inTimezone(tz).create();

  ss.setActiveSheet(sh);
  safeToast_('Mood Compass is set up. Now deploy it as a web app.');
}

/* ---------- Reminders ---------- */

function remindMorning() { remind_('Morning'); }
function remindAfternoon() { remind_('Afternoon'); }
function remindEvening() { remind_('Evening'); }

function remind_(slot) {
  const today = fmt_(new Date());
  const todays = readEntries_(1).filter(e => e.date === today);
  if (todays.some(e => e.slot === slot)) return; // already done — no nagging

  const url = appUrl_();
  const buttons = ['2', '1', '0', '-1', '-2'].map(s => {
    const m = MOODS[s];
    const href = url ? `${url}?slot=${slot}&mood=${s}` : '#';
    return `<a href="${href}" style="display:block;margin:6px 0;padding:12px 16px;border-radius:12px;` +
      `background:${m.color};color:#fff;text-decoration:none;font:600 16px system-ui">${m.emoji}&nbsp; ${m.label}</a>`;
  }).join('');
  const progress = SLOTS.map(s => todays.some(e => e.slot === s) ? '●' : '○').join(' ');

  MailApp.sendEmail({
    to: email_(),
    subject: `${SLOT_EMOJI[slot]} ${slot} mood check-in`,
    htmlBody:
      `<div style="max-width:420px;font:15px/1.5 system-ui;color:#1f2a44">` +
      `<p style="font-size:18px;font-weight:600">How are you feeling this ${slot.toLowerCase()}?</p>` +
      `<p style="color:#667">Today so far: ${progress} &nbsp;Tap one to open your check-in:</p>` +
      buttons +
      (url ? '' : '<p style="color:#c00">Open the web app once so these buttons can link to it.</p>') +
      `<p style="color:#99a;font-size:12px;margin-top:20px">Takes 10 seconds. Add a note if anything stood out.</p></div>`,
  });
}

/* ---------- Weekly summary ---------- */

function weeklySummary() {
  const entries = readEntries_(7).sort(byTime_);
  const url = appUrl_();
  if (!entries.length) {
    MailApp.sendEmail(email_(), '🧭 Your Mood Compass week',
      'No check-ins this week. That\'s okay — a fresh week starts now.' + (url ? '\n\n' + url : ''));
    return;
  }
  const avg = entries.reduce((a, e) => a + e.score, 0) / entries.length;
  const counts = {};
  entries.forEach(e => counts[e.score] = (counts[e.score] || 0) + 1);

  const bars = ['2', '1', '0', '-1', '-2'].map(s => {
    const n = counts[s] || 0, m = MOODS[s];
    return `<tr><td style="padding:2px 8px 2px 0;white-space:nowrap">${m.emoji} ${m.label}</td>` +
      `<td style="width:100%"><div style="background:${m.color};height:14px;border-radius:7px;` +
      `width:${Math.max(2, Math.round(100 * n / entries.length))}%"></div></td><td style="padding-left:8px">${n}</td></tr>`;
  }).join('');

  const notes = [];
  const run = longestRun_(entries);
  if (run.up >= 3) notes.push(`You had ${run.up} check-ins in a row at Elevated or higher.`);
  if (run.down >= 3) notes.push(`You had ${run.down} check-ins in a row at Low or below.`);
  const byDay = {};
  entries.forEach(e => (byDay[e.date] = byDay[e.date] || []).push(e.score));
  const mixed = Object.keys(byDay).filter(d => Math.max(...byDay[d]) >= 1 && Math.min(...byDay[d]) <= -1);
  if (mixed.length) notes.push(`Big same-day swings on ${mixed.length} day(s) (${mixed.join(', ')}).`);
  const sleeps = entries.filter(e => e.sleep != null).map(e => e.sleep);
  if (sleeps.length) notes.push(`Average sleep: ${(sleeps.reduce((a, b) => a + b, 0) / sleeps.length).toFixed(1)} h.`);
  const missed = entries.filter(e => e.meds === false).length;
  if (missed) notes.push(`Meds marked as missed ${missed} time(s).`);
  if (!notes.length || (run.up < 3 && run.down < 3 && !mixed.length)) notes.push('A fairly steady week. Nice work keeping up with it.');

  MailApp.sendEmail({
    to: email_(),
    subject: `🧭 Your Mood Compass week — ${moodLabel_(avg)} on average`,
    htmlBody:
      `<div style="max-width:460px;font:15px/1.5 system-ui;color:#1f2a44">` +
      `<p style="font-size:18px;font-weight:600">Your week at a glance</p>` +
      `<p>${entries.length} of 21 check-ins · average <b>${moodLabel_(avg)}</b> (${avg >= 0 ? '+' : ''}${avg.toFixed(1)})</p>` +
      `<table style="width:100%;border-collapse:collapse;font-size:14px">${bars}</table>` +
      `<ul>${notes.map(n => `<li>${n}</li>`).join('')}</ul>` +
      `<p style="color:#667;font-size:13px">Consider sharing patterns like these with your care team.` +
      ` If you're ever in crisis, call or text 988 (US) or your local emergency number.</p>` +
      (url ? `<p><a href="${url}">Open Mood Compass</a></p>` : '') + `</div>`,
  });
}

/* ---------- Helpers ---------- */

function readEntries_(days) {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const cutoff = Utilities.formatDate(new Date(Date.now() - (days - 1) * 864e5), tz, 'yyyy-MM-dd');
  return sh.getRange(2, 1, last - 1, HEADERS.length).getValues()
    .map((r, i) => ({
      row: i + 2,
      date: r[1] instanceof Date ? Utilities.formatDate(r[1], tz, 'yyyy-MM-dd') : String(r[1]),
      slot: String(r[2]),
      score: Number(r[4]),
      sleep: r[5] === '' ? null : Number(r[5]),
      meds: r[6] === 'Yes' ? true : r[6] === 'No' ? false : null,
      notes: String(r[7] || ''),
    }))
    .filter(e => e.date >= cutoff && SLOTS.includes(e.slot) && MOODS[String(e.score)]);
}

function longestRun_(sorted) {
  let up = 0, down = 0, u = 0, d = 0;
  sorted.forEach(e => {
    u = e.score >= 1 ? u + 1 : 0;
    d = e.score <= -1 ? d + 1 : 0;
    up = Math.max(up, u); down = Math.max(down, d);
  });
  return { up, down };
}

function byTime_(a, b) {
  return a.date === b.date ? SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) : (a.date < b.date ? -1 : 1);
}

function moodLabel_(avg) { return MOODS[String(Math.max(-2, Math.min(2, Math.round(avg))))].label; }
function sheet_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET);
  if (!sh) throw new Error('Run setup() from the Apps Script editor first.');
  return sh;
}
function fmt_(d, pattern) {
  return Utilities.formatDate(d, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), pattern || 'yyyy-MM-dd');
}
function appUrl_() { return PropertiesService.getScriptProperties().getProperty('APP_URL') || ScriptApp.getService().getUrl() || ''; }
function email_() { return CONFIG.REMINDER_EMAIL || Session.getEffectiveUser().getEmail(); }
function safeToast_(msg) { try { SpreadsheetApp.getActive().toast(msg, 'Mood Compass', 8); } catch (e) {} }
