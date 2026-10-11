import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Emit a self-contained `.next/standalone` server (server.js plus only the traced node_modules).
  // The production Docker image (see Dockerfile) copies just that folder, which keeps the image
  // small and lets it run without `npm install`. `next dev` and `next start` are unaffected.
  output: "standalone",
};

export default nextConfig;
