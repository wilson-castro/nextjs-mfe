/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const remoteZoneUrl =
      process.env.REMOTE_ZONE_URL ||
      process.env.REMOTE_APP_URL ||
      'http://localhost:3001';

    return [
      // 1. Zone root: explicit match for /remote-app
      {
        source: '/remote-app',
        destination: `${remoteZoneUrl}/remote-app`,
      },
      // 2. Zone sub-routes: matches all paths and endpoints under /remote-app/
      {
        source: '/remote-app/:path*',
        destination: `${remoteZoneUrl}/remote-app/:path*`,
      },
      // 3. Zone static assets: matches static chunks and assets under /remote-app-static/
      {
        source: '/remote-app-static/:path*',
        destination: `${remoteZoneUrl}/remote-app-static/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
