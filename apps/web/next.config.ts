import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{source:"/:path*",headers:[
      {key:"X-Robots-Tag",value:"noindex, nofollow, noarchive"},
      {key:"X-Content-Type-Options",value:"nosniff"}
    ]}];
  },
};

export default nextConfig;
