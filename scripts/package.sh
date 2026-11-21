#!/bin/zsh
# Builds "dist/Feng Shui.app" (aka Morrow) from the local Electron runtime. No Xcode needed:
# it copies Electron.app, adds the app's code and icon, renames it and signs
# it ad hoc so macOS will run it on this Mac.
set -euo pipefail
cd "$(dirname "$0")/.."

APP="dist/Feng Shui.app"
RES="$APP/Contents/Resources"
PLIST="$APP/Contents/Info.plist"

[[ -f build/icon.icns ]] || npx electron scripts/make-icon.js
[[ -f native/build/Release/morrow_native.node ]] || npm run native || echo "Native helper not built; packaging without it."

rm -rf dist
mkdir -p dist
cp -R node_modules/electron/dist/Electron.app "$APP"
rm -f "$RES/default_app.asar"
mkdir -p "$RES/app"
cp -R package.json src "$RES/app/"
if [[ -f native/build/Release/morrow_native.node ]]; then
  mkdir -p "$RES/app/native/build/Release"
  cp native/build/Release/morrow_native.node "$RES/app/native/build/Release/"
fi
cp build/icon.icns "$RES/electron.icns"

# Feng Shui is in English (with Hebrew for local text); drop Chromium's other
# interface languages, which are about 47 MB together.
KEEP=(en en_GB he Base)
for dir in "$RES" "$APP/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources"; do
  for l in "$dir"/*.lproj(N); do
    name=${${l:t}%.lproj}
    (( ${KEEP[(Ie)$name]} )) || rm -rf "$l"
  done
done

plutil -replace CFBundleName -string "Feng Shui" "$PLIST"
plutil -replace CFBundleDisplayName -string "Feng Shui" "$PLIST"
plutil -replace CFBundleIdentifier -string app.morrow.desktop "$PLIST"
plutil -replace CFBundleShortVersionString -string "$(node -p "require('./package.json').version")" "$PLIST"
# No Dock icon at launch; Feng Shui shows one only if "Show in Dock" is on.
plutil -replace LSUIElement -bool true "$PLIST"
plutil -replace LSApplicationCategoryType -string public.app-category.productivity "$PLIST"
plutil -replace NSLocationUsageDescription -string "Feng Shui uses your location only when you ask it to show local weather." "$PLIST"
plutil -replace NSLocationWhenInUseUsageDescription -string "Feng Shui uses your location only when you ask it to show local weather." "$PLIST"

codesign --force --deep --sign - "$APP" >/dev/null 2>&1
echo "Built $APP"
