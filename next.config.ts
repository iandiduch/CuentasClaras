import type { NextConfig } from "next";

// Mirrors the IS_HTTPS derivation in lib/server/auth/session.ts: `next start`
// forces NODE_ENV=production regardless of the real deployment, so APP_URL
// is the only reliable signal for whether this is actually served over TLS.
const IS_HTTPS = (process.env.APP_URL ?? "").startsWith("https://");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // No legitimate reason for this app to be framed by another site — blocks
  // clickjacking regardless of browser CSP support level.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ...(IS_HTTPS
    ? [{ key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.0.100",
    "localhost",
    "127.0.0.1",
    "*.local",
    "192.168.*.*",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
