/** @type {import('next').NextConfig} */
const controlPlane = process.env.CONTROL_PLANE_URL || "http://localhost:8080";

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Proxy API + catalog to the Go control-plane so the browser uses one origin.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${controlPlane}/api/:path*` },
      { source: "/catalog/:path*", destination: `${controlPlane}/catalog/:path*` },
    ];
  },
};

export default nextConfig;
