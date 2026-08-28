const { NextFederationPlugin } = require('@module-federation/nextjs-mf');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config, options) {
    config.plugins.push(
      new NextFederationPlugin({
        name: 'remote',
        filename: 'static/chunks/remoteEntry.js',
        exposes: {
          './ServerCard': './components/ServerCard.tsx',
          './getServerData': './lib/getServerData.ts',
        },
        shared: {},
      })
    );

    return config;
  },
};

module.exports = nextConfig;
