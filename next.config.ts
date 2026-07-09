import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
  // Everything lives on the custom domain. The old vercel.app address
  // permanently redirects so it never shows up in the Base App browser.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "based-turtle.vercel.app" }],
        destination: "https://basedturtle.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
