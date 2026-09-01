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
          './RemoteMap': './components/RemoteMap.tsx',
          './RemoteTelemetry': './components/RemoteTelemetry.tsx',
          './RemoteDashboard': './components/RemoteDashboard.tsx',
          './getServerData': './lib/getServerData.ts',
          './events': './lib/events.ts',
        },
        shared: {},
      })
    );

    return config;
  },
};

module.exports = nextConfig;
