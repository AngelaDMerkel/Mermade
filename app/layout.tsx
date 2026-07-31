import type { Metadata } from "next";
import "./globals.css";

const repository = process.env.GITHUB_REPOSITORY?.split("/");
const socialBaseUrl = process.env.NEXT_PUBLIC_SITE_URL || (
  process.env.GITHUB_ACTIONS === "true" && repository?.length === 2
    ? `https://${repository[0]}.github.io/${repository[1]}/`
    : "http://localhost:3000"
);

export const metadata: Metadata = {
  metadataBase: new URL(socialBaseUrl),
  title: "Mermade — Visual Mermaid Editor",
  description: "A direct-manipulation visual editor for powerful, portable Mermaid diagrams.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Mermade — Visual Mermaid Editor",
    description: "Build Mermaid diagrams visually, then take the source anywhere.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Mermade visual Mermaid editor" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mermade — Visual Mermaid Editor",
    description: "Build Mermaid diagrams visually, then take the source anywhere.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
