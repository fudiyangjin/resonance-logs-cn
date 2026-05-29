import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations#preprocessors
	// for more information about preprocessors
	compilerOptions: {
		runes: true,
	},
	preprocess: vitePreprocess(),

	kit: {
		alias: {
			$parserData: resolve(rootDir, "parser-data"),
		},
		adapter: adapter({
			fallback: "index.html",
		}),
		prerender: {
			handleUnseenRoutes: 'ignore',
		},
	},
};

export default config;
