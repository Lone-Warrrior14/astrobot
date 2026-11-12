#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHAT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=========================================="
echo " Building Astra Talk Mobile APK"
echo " (Completely isolated from Web/PWA stack)"
echo "=========================================="

export JAVA_HOME="$HOME/jdk21/jdk-21.0.13+9"
export ANDROID_HOME="$HOME/android-sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "1. Building Mobile Web Assets from mobile/web-src..."
cd "$SCRIPT_DIR/web-src"
"$CHAT_ROOT/frontend/node_modules/.bin/vite" build --outDir "$SCRIPT_DIR/dist"

echo "2. Syncing with Android native project..."
cd "$SCRIPT_DIR"
npx cap sync android
sed -i 's|gradle-9.*-bin.zip|gradle-8.14.3-all.zip|g' "$SCRIPT_DIR/android/gradle/wrapper/gradle-wrapper.properties"

echo "3. Assembling Debug APK with Gradle..."
cd "$SCRIPT_DIR/android"
./gradlew assembleDebug

echo "4. Copying output APK..."
cp "$SCRIPT_DIR/android/app/build/outputs/apk/debug/app-debug.apk" "$SCRIPT_DIR/AstraTalk-debug.apk"
cp "$SCRIPT_DIR/AstraTalk-debug.apk" "$CHAT_ROOT/AstraTalk-debug.apk"

echo "=========================================="
echo "✓ Success! Isolated Mobile APK built at:"
echo "  $SCRIPT_DIR/AstraTalk-debug.apk"
echo "=========================================="
