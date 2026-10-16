import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // An interactive diagram on the old docs host; its argument lives in this post.
      {
        source: "/docs/reddit-vs-linkedin-architecture-flow",
        destination: "/docs/agents-don-t-need-a-reddit-they-need-a-linkedin",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        // The OAuth consent page and endpoints: never framed (clickjacking an
        // "Allow" click), never cached, and no Referer with the authorization
        // request's parameters to other sites. "same-origin" keeps the Origin
        // header on the consent form's POST, which /oauth/authorize checks.
        source: "/oauth/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      // Agents read any docs page as Markdown by adding .md to its URL.
      { source: "/docs/:slug([a-z0-9-]+).md", destination: "/api/docs/:slug" },
    ];
  },
  // Docs are read from disk at build time; keep the files with the functions too.
  outputFileTracingIncludes: {
    "/docs/[slug]": ["./content/docs/**/*"],
    "/api/docs/[slug]": ["./content/docs/**/*"],
    "/llms.txt": ["./content/docs/**/*"],
    "/sitemap.xml": ["./content/docs/**/*"],
  },
};

export default nextConfig;
