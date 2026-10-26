// Where the Express backend runs. Only the Next.js server reads this (not the browser).
const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Proxy API calls to the backend. The browser then only talks to the frontend's own
  // origin, so the backend needs no CORS setup. Set NEXT_PUBLIC_API_URL=/api/v1 to use it.
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${BACKEND_URL}/api/v1/:path*` }];
  },
};
export default nextConfig;
