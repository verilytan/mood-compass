#!/usr/bin/env bash
# Mood Compass local setup: pushes to GitHub and deploys to Google Apps Script.
# Needs: git, GitHub CLI (gh), Node.js. Run from this folder:  bash setup.sh
set -euo pipefail
cd "$(dirname "$0")"

need() { command -v "$1" >/dev/null || { echo "✗ Missing '$1'. $2"; exit 1; }; }
need git  "Install from https://git-scm.com"
need gh   "Install from https://cli.github.com"
need node "Install from https://nodejs.org (LTS)"

echo "== 1/3 GitHub =="
gh auth status >/dev/null 2>&1 || gh auth login
if git remote get-url origin >/dev/null 2>&1; then
  git push -u origin main
else
  read -rp "Repo visibility [private/public] (private): " vis
  gh repo create mood-compass --"${vis:-private}" --source . --remote origin --push \
    --description "Three-a-day mood tracker with bipolar mood scale, smart reminders and Google Sheets sync"
fi

echo "== 2/3 Google Apps Script =="
command -v clasp >/dev/null || npm install -g @google/clasp
echo "→ Turn on the Apps Script API once at https://script.google.com/home/usersettings"
read -rp "Press Enter when that's on…"
[ -f ~/.clasprc.json ] || clasp login
if [ ! -f .clasp.json ]; then
  clasp create --type sheets --title "Mood Compass"
  git checkout -- appsscript.json 2>/dev/null || true   # keep our manifest
fi
clasp push -f

echo "== 3/3 Finish in the browser =="
cat <<'MSG'
1. Run:  clasp open        (opens the Apps Script editor)
2. Pick the "setup" function → Run → approve permissions.
3. Deploy → New deployment → Web app → Deploy. Open the URL on your phone
   and Add to Home Screen.
After future edits:  git commit … && git push && clasp push
MSG
