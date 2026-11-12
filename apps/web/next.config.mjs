import { withSentryConfig } from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@tripeseats/auth", "recharts"],

  experimental: {
    instrumentationHook: isProd
  },

  images: {
    remotePatterns: [],
    formats: ["image/avif", "image/webp"]
  },

  productionBrowserSourceMaps: false,
  compress: true,
  poweredByHeader: false,

  // Allow embed routes to be loaded in iframes from any origin
  async headers() {
    return [
      {
        source: "/embed/:path*",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: "frame-ancestors *" }
        ]
      }
    ];
  },

  // Faster dev builds — run `pnpm typecheck` and `pnpm lint` separately
  ...(!isProd && {
    typescript: { ignoreBuildErrors: true },
    eslint: { ignoreDuringBuilds: true }
  })
};

const sentryBuildOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring"
};

export default isProd ? withSentryConfig(nextConfig, sentryBuildOptions) : nextConfig;
