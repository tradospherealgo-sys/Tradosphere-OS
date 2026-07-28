/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Task 10.1 (Foundation): apps/web talks to apps/api only, through
  // @tradosphere/sdk. No rewrites/proxies to any broker or service are
  // configured here on purpose -- see docs/architecture/web-frontend.md's
  // "Broker abstraction guarantee" section.
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000',
  },
};

export default nextConfig;
