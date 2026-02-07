import sitemap from "@astrojs/sitemap";
import tailwind from "@astrojs/tailwind";
import { defineConfig } from "astro/config";

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
