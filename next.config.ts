import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Turbopack infers the project root from the nearest lockfile, which picks up
// stray lockfiles in parent directories on some machines and changes module
// resolution. Pin it to this directory so local and Vercel builds agree.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
