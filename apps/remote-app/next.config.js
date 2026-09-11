/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  basePath: '/remote-app',
  assetPrefix: '/remote-app-static',
  async rewrites() {
    return [
      {
        source: '/_fragmento/:name/:id',
        destination: '/api/fragmento/:name/:id?name=:name&id=:id',
      },
    ];
  },
};

module.exports = nextConfig;
