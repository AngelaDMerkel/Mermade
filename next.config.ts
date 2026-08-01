import type { NextConfig } from "next";

const isGitHubPages = process.env.MERMADE_GITHUB_PAGES === "true";
const isTestBuild = process.env.MERMADE_TEST_BUILD === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] || "mermade";
const basePath = isGitHubPages ? `/${repositoryName}` : "";

const nextConfig: NextConfig = {
  output: isGitHubPages ? "export" : undefined,
  distDir: isTestBuild ? ".next-test" : ".next",
  basePath,
  assetPrefix: basePath || undefined,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // Keep Next.js development chrome from covering Mermade's Settings control.
  devIndicators: false,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
