const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: false,
    name: 'WritersToolkit',
    executableName: 'writers-toolkit',
    icon: './resources/icon',
    osxSign: false, // Explicitly disable signing
    osxNotarize: false, // Explicitly disable notarization
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32'],
    },
    {
      name: '@electron-forge/maker-dmg',
      icon: './resources/WritersToolkit.icns',
      background: './resources/dmg-background.png',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'WritersToolkit',
        authors: 'Chris Smith',
        description: "A toolkit for writers with AI assistance and a text editor",
        setupIcon: './resources/icons/win/icon.ico',
        // Add these properties for proper Start menu integration
        shortcutName: "Writer's Toolkit",
        // Optional but recommended product name for Start menu folder
        productName: "Writer's Toolkit",
        // Create Start menu shortcut
        loadingGif: undefined,
        // Add registry keys for better Windows integration
        noMsi: false,
        // Tell Squirrel to create a desktop shortcut
        createDesktopShortcut: true
      },
      platforms: ['win32'],
    }
  ]
};
