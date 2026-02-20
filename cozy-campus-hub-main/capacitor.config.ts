import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.chirag.messbuddy',
    appName: 'Kanhaiya Mess',
    webDir: 'dist',

    // ✅ LIVE UPDATE: Loads from Vercel — no APK update needed for web changes
    // Replace with your actual Vercel URL below:
    server: {
        url: 'https://messbuddy-ten.vercel.app/', // ← replace with your actual Vercel URL
        cleartext: false, // HTTPS only
        androidScheme: 'https',
    },

    android: {
        buildOptions: {
            releaseType: 'APK',
        },
        // WebView performance optimizations
        allowMixedContent: false,
        captureInput: true,
        webContentsDebuggingEnabled: false, // set true only during dev
    },

    plugins: {
        SplashScreen: {
            launchShowDuration: 2000,
            launchAutoHide: true,
            backgroundColor: '#ffffff',
            androidSplashResourceName: 'splash',
            showSpinner: false,
            androidScaleType: 'CENTER_CROP',
            splashFullScreen: true,
            splashImmersive: true,
        },
        StatusBar: {
            style: 'DEFAULT',
            backgroundColor: '#ffffff',
        },
    },
};

export default config;
