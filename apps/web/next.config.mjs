/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["recharts"],

  images: {
    remotePatterns: [],
    formats: ["image/avif", "image/webp"]
  },

  productionBrowserSourceMaps: false,
  compress: true,
  poweredByHeader: false
};

export default nextConfig;
