import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
};

export default nextConfig;
