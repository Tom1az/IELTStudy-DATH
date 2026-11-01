// Where the Express backend runs. Only the Next.js server reads this (not the browser).
const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:3000").replace(/\/$/, "");
// Where the standalone Advanced service (BKT mastery + recommendations) runs.
const ADVANCED_URL = (process.env.ADVANCED_URL ?? "http://localhost:4001").replace(/\/$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Proxy API calls so the browser only talks to the frontend's own origin (no CORS needed).
  // Rewrites are matched in order: the Advanced-owned paths must come BEFORE the catch-all.
  // The Authorization header (the learner's JWT) is forwarded as-is. Advanced checks it with
  // the same JWT_SECRET and reads the user from the same database, so no account data has
  // to be passed between the two services.
  async rewrites() {
    const toAdvanced = (source) => ({ source, destination: `${ADVANCED_URL}${source}` });
    return [
      toAdvanced("/api/v1/me/mastery"),
      toAdvanced("/api/v1/recommendations"),
      toAdvanced("/api/v1/recommendations/:recommendationId/click"),
      toAdvanced("/api/v1/mastery/:path*"),
      toAdvanced("/api/v1/progress/me"),
      toAdvanced("/api/v1/courses/:courseId/gates"),
      { source: "/api/v1/:path*", destination: `${BACKEND_URL}/api/v1/:path*` },
    ];
  },
};
export default nextConfig;