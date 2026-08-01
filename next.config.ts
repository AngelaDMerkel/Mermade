import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_ACTIONS === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] || "mermade";
const basePath = isGitHubPages ? `/${repositoryName}` : "";

const nextConfig: NextConfig = {
  output: isGitHubPages ? "export" : undefined,
  basePath,
  assetPrefix: basePath || undefined,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
