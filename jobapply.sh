#!/usr/bin/env sh
# Start JobApply on macOS or Linux and open it in your browser.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get it from https://nodejs.org and run this again."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing JobApply for the first time. This takes a minute..."
  npm install
fi

echo "Starting JobApply at http://localhost:3000  (press Ctrl+C to stop it)"
(
  sleep 4
  if command -v open >/dev/null 2>&1; then
    open http://localhost:3000
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open http://localhost:3000
  fi
) >/dev/null 2>&1 &

npm run dev
