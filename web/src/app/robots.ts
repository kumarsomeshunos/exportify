import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/callback", "/export"],
    },
    sitemap: "https://exportify.kumarsomesh.com/sitemap.xml",
  };
}
