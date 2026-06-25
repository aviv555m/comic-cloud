# ComicCloud

ComicCloud is a modern, premium digital comic and manga library application designed for both web and mobile experiences. It features a pitch-dark violet aesthetic, full offline capabilities, and integrations with online manga providers and AniList.

## Features

- **Multi-Format Reader**: Seamlessly open and read CBZ, PDF, and EPUB files.
- **Continuous Webtoon Scroll**: Optimized mobile reading experience with smooth continuous vertical scrolling.
- **Online Manga Browser**: Integrated browser for `comix.to` and MangaDex, letting you search and read right inside the app.
- **AniList Integration**: Log in with your AniList account to automatically sync your manga progress.
- **Offline Mode**: Download books directly to your device via IndexedDB (database: `comic-cloud-offline`) to keep reading on the go.
- **Android Support**: Fully configured with Capacitor to compile as a native Android app.

## Tech Stack

- **Frontend**: React, Vite, TypeScript, Tailwind CSS, shadcn/ui
- **Icons**: Lucide React
- **Mobile Container**: Capacitor
- **Database / Backend**: Supabase

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm or bun

### Local Development

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd comic-cloud
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

### Building for Android

1. Compile the web assets:
   ```bash
   npm run build
   ```

2. Sync web assets with the Capacitor Android project:
   ```bash
   npx cap sync
   ```

3. Build the Android APK using Gradle:
   ```bash
   cd android
   ./gradlew assembleDebug
   ```

The compiled APK will be output at `android/app/build/outputs/apk/debug/app-debug.apk`.
