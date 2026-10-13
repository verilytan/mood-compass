# 🧭 Mood Compass

A mood tracker for three check-ins a day (morning, afternoon, evening). It runs inside your own Google Sheet, so every entry is saved there automatically.

## What it does
- **5 moods on a bipolar spectrum:** ⚡ Manic · ☀️ Elevated · 🌿 Balanced · 🌧️ Low · 🌑 Depressed (scored +2 to −2)
- **Notes** on every check-in, plus optional **sleep hours** (morning only) and a **meds taken** toggle
- **Smart reminders:** emails at 9:00, 14:00 and 20:00, sent *only if that check-in isn't done yet*. Each email has five mood buttons. Tap one and the app opens with that mood already picked.
- **Weekly summary email** every Sunday evening: how your moods were spread, your average, and any patterns to watch
- **Insights in the app** that look for:
  - 3+ check-ins in a row at Elevated/Manic or at Low/Depressed (early-warning runs)
  - big mood swings within a single day
  - short sleep, and how sleep relates to your mood over time
  - times of day when you tend to feel lower
  - missed meds
- Streak counter, a 14-day chart, and a list of recent check-ins
- The Google Sheet gets a colour-coded **Entries** tab and a **Daily** tab with a live chart

## Setup (about 5 minutes)
1. Create a new Google Sheet (sheets.new) and name it **Mood Compass**.
2. **File → Settings** → check that the **time zone** is yours. Reminders use this time zone.
3. **Extensions → Apps Script.**
   - Replace everything in `Code.gs` with the contents of `Code.gs` from this folder.
   - Click **+ → HTML**, name the file `Index` (exactly that), and paste in `Index.html`.
   - Save (💾).
4. In the function dropdown at the top, pick **`setup`** and click **Run**. Approve the permissions (Google will warn that the app is "unverified" because you wrote it yourself: click *Advanced → Go to Mood Compass*).
5. **Deploy → New deployment** → type **Web app** → Execute as **Me**, Who has access **Only myself** → **Deploy**. Copy the URL.
6. Open that URL on your phone, then:
   - iPhone: Share → **Add to Home Screen**
   - Android (Chrome): ⋮ → **Add to Home screen**

   Open it once before the first reminder goes out, so the emails know where to link.

## Customize
Change the `CONFIG` block at the top of `Code.gs`:
```js
REMINDERS: { Morning: 9, Afternoon: 14, Evening: 20 },
WEEKLY_SUMMARY: { day: 'SUNDAY', hour: 19 },
REMINDER_EMAIL: '',   // blank = your Google account
```
After changing reminder times, run `setup()` again. It's safe to re-run and won't touch your data.

If you edit the code later, use **Deploy → Manage deployments → ✏️ → Version: New version** so the URL stays the same.

## Preview
Open `Index.html` directly in a browser to try it with sample data. In this preview mode nothing syncs to Google.

## Privacy
Everything stays in your Google account: your Sheet, your script, emails to yourself. Nothing goes to any outside service.

*Mood Compass is a self-tracking tool, not medical advice. If you're in crisis, call or text 988 (US) or your local emergency number.*
