import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Basic Auth proxy.ts buffers every request body (10MB default) to be
    // able to read it; without raising this, a large phone photo posted to
    // /api/edit/upload-image would be silently truncated rather than erroring.
    proxyClientMaxBodySize: "25mb",
  },
};

export default nextConfig;
