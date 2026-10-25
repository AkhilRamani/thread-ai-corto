import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // The callback query contains a short-lived authorization code.
  logging: { incomingRequests: { ignore: [/\/api\/auth\/github\/callback/] } },
};

export default nextConfig;
