import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Codex Remote Control Lab",
  description: "Local-first Codex app-server and phone bridge experiments.",
  base: "/codex-remote-control-lab/",
  cleanUrls: true,
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/codex-remote-control-lab/favicon.svg" }],
    ["link", { rel: "manifest", href: "/codex-remote-control-lab/site.webmanifest" }],
    ["meta", { name: "theme-color", content: "#15151a" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "Codex Remote Control Lab" }],
    ["meta", { property: "og:description", content: "Local-first Codex app-server and token-protected LAN phone bridge experiments." }],
    ["meta", { property: "og:image", content: "https://sunwood-ai-labs.github.io/codex-remote-control-lab/social-card.svg" }],
  ],
  locales: {
    root: {
      label: "English",
      lang: "en-US",
      themeConfig: {
        nav: [
          { text: "Guide", link: "/guide/phone-bridge" },
          { text: "Releases", link: "/guide/releases/v0.2.0" },
          { text: "Safety", link: "/guide/security" },
          { text: "GitHub", link: "https://github.com/Sunwood-ai-labs/codex-remote-control-lab" },
        ],
        sidebar: [
          {
            text: "Guide",
            items: [
              { text: "Phone Bridge", link: "/guide/phone-bridge" },
              { text: "Protocol Notes", link: "/guide/protocol" },
              { text: "Security", link: "/guide/security" },
              { text: "v0.2.0 Release", link: "/guide/releases/v0.2.0" },
              { text: "v0.2.0 Walkthrough", link: "/guide/articles/v0.2.0-phone-bridge" },
            ],
          },
        ],
      },
    },
    ja: {
      label: "日本語",
      lang: "ja-JP",
      link: "/ja/",
      themeConfig: {
        nav: [
          { text: "ガイド", link: "/ja/guide/phone-bridge" },
          { text: "リリース", link: "/ja/guide/releases/v0.2.0" },
          { text: "安全設計", link: "/ja/guide/security" },
          { text: "GitHub", link: "https://github.com/Sunwood-ai-labs/codex-remote-control-lab" },
        ],
        sidebar: [
          {
            text: "ガイド",
            items: [
              { text: "Phone Bridge", link: "/ja/guide/phone-bridge" },
              { text: "Protocol Notes", link: "/ja/guide/protocol" },
              { text: "Security", link: "/ja/guide/security" },
              { text: "v0.2.0 Release", link: "/ja/guide/releases/v0.2.0" },
              { text: "v0.2.0 Walkthrough", link: "/ja/guide/articles/v0.2.0-phone-bridge" },
            ],
          },
        ],
      },
    },
  },
  themeConfig: {
    logo: "/logo.svg",
    siteTitle: "Codex Remote",
    socialLinks: [{ icon: "github", link: "https://github.com/Sunwood-ai-labs/codex-remote-control-lab" }],
    search: {
      provider: "local",
    },
  },
});
