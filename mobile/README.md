# Astra Talk Mobile (Android)

Dedicated Android native mobile version of **Astra Talk**.

---

## 📁 Directory Structure
```
mobile/
├── android/               # Complete Gradle & Android Studio native project
│   ├── app/               # Main application module & AndroidManifest.xml
│   ├── build.gradle       # Root gradle file
│   └── gradlew            # Gradle wrapper executable
├── dist/                  # Bundled frontend assets for WebView container
├── build_apk.sh           # One-command build script
├── package.json           # Capacitor configuration and scripts
├── capacitor.config.json  # Mobile app ID (com.astratalk.app) and configurations
└── AstraTalk-debug.apk    # Built installable Android APK file
```

---

## 🚀 Building the APK
To rebuild the APK anytime after modifying features or companion animations:
```bash
./mobile/build_apk.sh
```

---

## 📱 Sideloading onto Android
1. Transfer `AstraTalk-debug.apk` directly to your Android device via USB cable, Drive, or local Wi-Fi.
2. Tap the APK file to install (enable *"Allow from this source"* if prompted).
3. Launch **Astra Talk**!
