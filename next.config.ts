import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    allowedDevOrigins: [
      '*.cloudworkstations.dev',
    ],
  },
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

module.exports = nextConfig;
