# Marginalia Android App

A native Android app with a **floating pen icon** that stays on screen even when the app is minimized, like a chat head.

## Features
- **Floating pen** - gold pen icon stays on top of all apps. Drag it anywhere. Tap to quick-capture a note.
- **Full web app** - loads the Marginalia web app in a WebView with full functionality
- **8 categories** - Observe, Images, Connections, Feelings, Ideas, Lines, Drafts, Poems
- **Offline** - works without internet after first load
- **Dark theme** - clean, modern design

## How to Build

### Option 1: Android Studio (Recommended)
1. Download Android Studio: https://developer.android.com/studio
2. Open Android Studio → File → Open → select the `android/` folder
3. Wait for Gradle sync to finish
4. Click the green Play button (or Build → Build Bundle/APK → Build APK)
5. The APK will be at `app/build/outputs/apk/debug/app-debug.apk`

### Option 2: Command Line (if you have Android SDK)
```bash
cd android
./gradlew assembleDebug
```
The APK will be at `app/build/outputs/apk/debug/app-debug.apk`

## How to Install on Phone
1. Build the APK (see above)
2. Transfer the APK to your phone (USB, email, cloud storage)
3. On your phone, open the APK file
4. Allow "Install from unknown sources" if prompted
5. Open Marginalia from your app drawer

## Permissions Used
- **Overlay (SYSTEM_ALERT_WINDOW)** - for the floating pen icon
- **Internet** - to load the web app
- **Foreground Service** - keeps the pen running when app is minimized

## How It Works
- The app loads the Marginalia web app (https://nishant007-afk.github.io/marginalia/app/) in a full-screen WebView
- A native Android service shows a gold pen icon on top of all apps
- When you tap the pen, a quick capture panel appears
- Type your note, pick a category, tap Save
- The note is saved to the web app's storage
- The pen stays visible even when you switch to other apps
- Drag the pen anywhere on screen to reposition it
