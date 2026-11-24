// Where the Express backend runs. Only the Next.js server reads this (not the browser).
const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Proxy API calls so the browser only talks to the frontend's own origin (no CORS needed).
  // The Authorization header (the learner's JWT) is forwarded as-is.
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${BACKEND_URL}/api/v1/:path*` }];
  },
};
export default nextConfig;
