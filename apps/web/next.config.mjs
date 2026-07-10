import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@tripeseats/auth", "recharts"],

  experimental: {
    instrumentationHook: true
  },

  images: {
    remotePatterns: [],
    formats: ["image/avif", "image/webp"]
  },

  productionBrowserSourceMaps: false,
  compress: true,
  poweredByHeader: false
};

const sentryBuildOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring"
};

export default withSentryConfig(nextConfig, sentryBuildOptions);
