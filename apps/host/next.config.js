const { NextFederationPlugin } = require('@module-federation/nextjs-mf');

/**
 * Resolve remote entry location dynamically based on runtime context.
 * Server SSR needs Node.js bundle (_next/static/ssr/remoteEntry.js),
 * Client hydration needs browser bundle (_next/static/chunks/remoteEntry.js).
 */
const getRemotes = (isServer) => {
  const location = isServer ? 'ssr' : 'chunks';
  return {
    remote: `remote@http://localhost:3001/_next/static/${location}/remoteEntry.js`,
  };
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config, options) {
    const { isServer } = options;

    config.plugins.push(
      new NextFederationPlugin({
        name: 'host',
        filename: 'static/chunks/remoteEntry.js',
        remotes: getRemotes(isServer),
        shared: {},
      })
    );

    return config;
  },
};

module.exports = nextConfig;
