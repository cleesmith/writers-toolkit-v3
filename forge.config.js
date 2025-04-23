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
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-dmg',
      icon: './resources/WritersToolkit.icns',
    }
  ]
};