#!/bin/bash
# Mount the newly created DMG
hdiutil attach "out/make/WritersToolkit-2.0.0-arm64.dmg" -noautoopen

# Wait for the volume to be mounted
sleep 2

# Hide system files
SetFile -a V "/Volumes/WritersToolkit/.background"
SetFile -a V "/Volumes/WritersToolkit/.VolumeIcon.icns"
SetFile -a V "/Volumes/WritersToolkit/.DS_Store"

# Unmount the volume
hdiutil detach "/Volumes/WritersToolkit"

echo "Post-processing complete: System files hidden"
