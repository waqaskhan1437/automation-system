/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "https://automation-api.waqaskhan1437.workers.dev/api/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
