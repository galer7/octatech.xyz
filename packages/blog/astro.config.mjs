import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://octatech.xyz",
  integrations: [tailwind(), sitemap()],
  output: "static",
  build: {
    format: "directory",
  },
  markdown: {
    shikiConfig: {
      theme: "github-dark",
    },
  },
});
