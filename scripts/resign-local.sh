#!/usr/bin/env bash
# Re-sign the locally-built Inkast.app ad-hoc, WITH entitlements + correct identifier.
#
# Why this is needed: electron-builder skips real code signing when there is no
# Apple Developer ID, leaving the app with a generic "Electron" linker signature
# and NO entitlements embedded. macOS TCC then refuses to register the app for
# Camera / Microphone / Screen Recording (it can't even be granted in Settings).
# Re-signing ad-hoc with our entitlements + the real bundle id fixes all three.
#
# Run this after every local build:
#   npx vite build && npx electron-builder --mac --arm64 --dir && bash scripts/resign-local.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# 可参数化:整合后若把 Suite 作为独立 bundle 与日常 Inkast 并存(避免抢录屏授权),设这两个环境变量:
#   INKAST_BUNDLE_ID=com.sgd.inkast-suite  INKAST_APP_NAME="Inkast Suite.app"
#   (electron-builder 侧对应:--config.appId=com.sgd.inkast-suite --config.productName="Inkast Suite")
# 默认不变(com.sgd.inkast / Inkast.app),所以现有日常打包流程零影响。
BUNDLE_ID="${INKAST_BUNDLE_ID:-com.sgd.inkast}"
APP_NAME="${INKAST_APP_NAME:-Inkast.app}"
BIN_NAME="${APP_NAME%.app}"
APP="${1:-$(find "$ROOT/release" -maxdepth 4 -name "$APP_NAME" 2>/dev/null | head -1)}"
ENT="$ROOT/macos.entitlements"

[ -d "$APP" ] || { echo "❌ $APP_NAME not found. Build first."; exit 1; }
echo "Re-signing: $APP (bundle id: $BUNDLE_ID)"

# Quit any running instance so we re-sign on-disk cleanly.
pkill -f "$APP_NAME/Contents/MacOS/$BIN_NAME" 2>/dev/null || true
sleep 1

# Prefer a STABLE codesigning identity (self-signed dev cert in the keychain) so
# macOS TCC grants (Screen Recording / Camera / Microphone) PERSIST across rebuilds.
# An ad-hoc ("-") signature gets a new identity every build → macOS treats each
# rebuild as a different app and re-prompts for permission every time.
SIGN_ID="$(security find-identity -v -p codesigning 2>/dev/null | awk -F'"' '/[0-9]+\)/{print $2; exit}')"
if [ -z "$SIGN_ID" ]; then
  echo "⚠️  No stable codesigning identity found — using ad-hoc; TCC grants will NOT persist across rebuilds."
  SIGN_ID="-"
else
  echo "Signing with stable identity: $SIGN_ID"
fi
codesign --force --deep --options runtime \
  --entitlements "$ENT" --identifier "$BUNDLE_ID" --sign "$SIGN_ID" "$APP"

echo "--- verify ---"
codesign --verify --deep --strict "$APP" && echo "✅ signature valid"
echo "embedded device entitlements:"
codesign -d --entitlements :- "$APP" 2>/dev/null | grep -o 'device\.[a-z-]*' | sort -u

# Fresh permission prompts on next launch.
tccutil reset Camera "$BUNDLE_ID" >/dev/null 2>&1 || true
tccutil reset Microphone "$BUNDLE_ID" >/dev/null 2>&1 || true

echo "Done. Launch with: open \"$APP\""
