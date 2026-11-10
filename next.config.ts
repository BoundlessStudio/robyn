import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  images: { qualities: [75, 85] },
  async rewrites() {
    return [{ source: "/mcp", destination: "/api/studio/external-mcp" }];
  },
  outputFileTracingIncludes: {
    "/.well-known/workflow/**": ["./vendor/robyn-workstation/**/*", "./src/studio/media-worker.py"],
    "/api/studio/external-mcp": ["./vendor/robyn-mcp-workstation/**/*"],
    "/api/studio/mailcraft/read": ["./vendor/robyn-mailcraft/managed-read.mjs"],
  },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
    ] }];
  },
};

export default withWorkflow(nextConfig);
