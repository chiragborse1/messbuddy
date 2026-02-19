import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.chirag.messbuddy',
    appName: 'MessBuddy',
    webDir: 'dist',

    // LIVE UPDATE MODE (recommended for production):
    // Uncomment the server block below after deploying to Vercel/Netlify.
    // This lets you push updates without releasing a new APK.
    //
    // server: {
    //   url: 'https://messbuddy.vercel.app',
    //   cleartext: false,
    // },

    android: {
        buildOptions: {
            releaseType: 'APK',
        },
    },
};

export default config;
