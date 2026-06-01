/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The telemetry route decompresses gzip bodies manually, so disable any
  // implicit body parsing assumptions by keeping route handlers on the Node runtime.
  experimental: {
    serverComponentsExternalPackages: [],
  },
};

module.exports = nextConfig;
