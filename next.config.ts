import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,
  async redirects() {
    return [
      { source: '/dashboard/talent', destination: '/dashboard/people', permanent: true },
      { source: '/dashboard/talent/:path*', destination: '/dashboard/people/:path*', permanent: true },
      { source: '/dashboard/reuniones', destination: '/dashboard/people/reuniones', permanent: true },
      { source: '/dashboard/manuales', destination: '/dashboard/people/manuales', permanent: true },
      { source: '/dashboard/flota', destination: '/dashboard/flota/celulares', permanent: true }
    ];
  },
  allowedDevOrigins: ['*.trycloudflare.com'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.slingacademy.com',
        port: ''
      }
    ]
  },
  transpilePackages: ['geist'],
  compiler: {
    // `error` y `warn` se conservan: son los logs de diagnostico del servidor
    // (cron /api/ping, login). Con removeConsole a secas se borraban en el
    // build de produccion y las fallas quedaban invisibles en Vercel.
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false
  }
};

export default nextConfig;
