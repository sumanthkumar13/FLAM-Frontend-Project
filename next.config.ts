import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  experimental: {
    // Enable Web Worker and OffscreenCanvas support
    workerThreads: true,
    esmExternals: true,
  },
}

export default nextConfig
