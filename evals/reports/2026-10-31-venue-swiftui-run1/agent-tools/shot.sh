#!/bin/sh
screencapture -x -o -l $(/tmp/venue-tools/winid $(pgrep -x Venue)) "$1"
