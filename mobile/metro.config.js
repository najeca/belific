// Expo's default Metro configuration, plus .woff2 as an asset type: the Windows
// desktop ships its interface fonts (Inter, Roboto Mono) inside the app so it
// works offline (2.26.0, components/desktop/desktopFonts.ts). The iPhone bundle
// never imports them.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('woff2');

module.exports = config;
