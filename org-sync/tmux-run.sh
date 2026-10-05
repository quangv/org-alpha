#!/usr/bin/env bash
# Usage: bash tmux-run.sh <npm-script>
# Runs "npm run <script>" in a tmux session named after the script,
# with the cwd always visible in the status bar.
set -e

SCRIPT="${1:?Usage: tmux-run.sh <npm-script>}"
SESSION="osync-$SCRIPT"
CWD="$(pwd)"

STATUS=" #[fg=colour243]$CWD#[default] "

if tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux attach-session -t "$SESSION"
else
  tmux new-session -s "$SESSION" \
    -x "$(tput cols)" -y "$(tput lines)" \
    \; set-option status-right "$STATUS" \
    \; set-option status-right-length 120 \
    \; send-keys "npm run $SCRIPT" Enter
fi
