#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHAT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=========================================="
echo " Building Astra Talk Mobile APK"
echo "=========================================="

export JAVA_HOME="$HOME/jdk21/jdk-21.0.13+9"
export ANDROID_HOME="$HOME/android-sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "1. Building Web Assets..."
cd "$CHAT_ROOT/frontend"
npm run build

echo "2. Copying distribution to mobile/dist..."
rm -rf "$SCRIPT_DIR/dist"
cp -r "$CHAT_ROOT/frontend/dist" "$SCRIPT_DIR/dist"

echo "3. Syncing with Android native project..."
cd "$SCRIPT_DIR"
npx cap sync android

echo "4. Assembling Debug APK with Gradle..."
cd "$SCRIPT_DIR/android"
./gradlew assembleDebug

echo "5. Copying output APK..."
cp "$SCRIPT_DIR/android/app/build/outputs/apk/debug/app-debug.apk" "$SCRIPT_DIR/AstraTalk-debug.apk"
cp "$SCRIPT_DIR/AstraTalk-debug.apk" "$CHAT_ROOT/AstraTalk-debug.apk"

echo "=========================================="
echo "✓ Success! APK built at: $SCRIPT_DIR/AstraTalk-debug.apk"
echo "=========================================="
