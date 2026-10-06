import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
  outputFileTracingExcludes: {
    "*": [
      "./ffmpeg.exe",
      "./yt-dlp.exe",
      "./public/clips/**/*",
      "./scripts/**/*",
      "./worker/**/*",
      "./temp_worker/**/*",
      "./huggingface-worker/**/*",
      "./.git/**/*",
      "./node_modules/@ffmpeg-installer/**/*",
      "./**/*.mp4",
    ],
  },
};

export default nextConfig;
