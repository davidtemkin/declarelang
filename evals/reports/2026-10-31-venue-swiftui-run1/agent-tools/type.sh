#!/bin/sh
# type.sh "text" — select all in focused field, then type
osascript -e 'tell application "System Events"' -e 'keystroke "a" using command down' -e "keystroke \"$1\"" -e 'end tell'
