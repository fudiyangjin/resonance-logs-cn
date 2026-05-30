import devtoolsJson from "vite-plugin-devtools-json";
// @ts-ignore
import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import Icons from 'unplugin-icons/vite'
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const loopbackHost = "127.0.0.1";
const rootDir = dirname(fileURLToPath(import.meta.url));
const parserDataDir = resolve(rootDir, "parser-data");

const SVELTE_VIRTUAL_STYLE_MODULE = /\.svelte\?.*svelte&type=style.*(?:&|\?)lang\.css(?:$|&)/;
type IdFilter = {
  exclude?: string | RegExp | (string | RegExp)[];
};

function isSvelteVirtualStyleModule(id: string) {
  const normalized = id.replace(/\\/g, "/");

  return (
    normalized.includes(".svelte?") &&
    normalized.includes("type=style") &&
    normalized.includes("lang.css")
  );
}

function isRawSvelteSource(code: string) {
  const trimmed = code.trimStart();

  return (
    trimmed.startsWith("<") ||
    code.includes("<script") ||
    code.includes("<style") ||
    code.includes("</script>") ||
    code.includes("</style>")
  );
}

function extractSvelteStyleCss(code: string) {
  const styleBlocks = Array.from(
    code.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi),
    (match) => (match[1] ?? "").trim(),
  );

  return styleBlocks.join("\n\n");
}

function svelteVirtualStyleFallbacks() {
  return {
    name: "svelte-virtual-style-fallbacks",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (!isSvelteVirtualStyleModule(id) || !isRawSvelteSource(code)) {
        return null;
      }

      return extractSvelteStyleCss(code);
    },
  };
}

function tailwindcssWithoutSvelteStyleModules() {
  const plugins = tailwindcss();
  const pluginList = Array.isArray(plugins) ? plugins : [plugins];

  for (const plugin of pluginList) {
    if (!plugin || typeof plugin !== "object") continue;

    const transform = plugin.transform;
    if (!transform || typeof transform !== "object") continue;

    const filter = transform.filter;
    if (filter && typeof filter === "object") {
      const idFilter = filter.id as IdFilter | undefined;
      if (idFilter && typeof idFilter === "object") {
        const currentExclude = idFilter.exclude;
        idFilter.exclude = Array.isArray(currentExclude)
          ? [...currentExclude, SVELTE_VIRTUAL_STYLE_MODULE]
          : currentExclude
            ? [currentExclude, SVELTE_VIRTUAL_STYLE_MODULE]
            : [SVELTE_VIRTUAL_STYLE_MODULE];
      }
    }

    const originalHandler = transform.handler;
    if (typeof originalHandler !== "function") continue;

    transform.handler = function (
      this: any,
      code: string,
      id: string,
      ...args: any[]
    ) {
      if (isSvelteVirtualStyleModule(id) && isRawSvelteSource(code)) {
        return extractSvelteStyleCss(code);
      }

      return originalHandler.call(this, code, id, ...args);
    };
  }

  return pluginList;
}

// https://vitejs.dev/config/
// @ts-ignore
export default defineConfig(async () => ({
  plugins: [
    svelteVirtualStyleFallbacks(),
    sveltekit(),
    tailwindcssWithoutSvelteStyleModules(),
    devtoolsJson(),
    // https://icones.js.org/
    Icons({ 
      compiler: 'svelte',
      // experimental
      autoInstall: true, 
    })],
  resolve: {
    alias: {
      $parserData: parserDataDir,
    },
  },
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  json: {
    stringify: true,
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || loopbackHost,
    hmr: { protocol: "ws", host: host || loopbackHost, port: 1421 },
    fs: {
      allow: [rootDir, parserDataDir],
    },
    watch: {
      // 3. keep Vite focused on frontend sources; local Rust/audit outputs can be huge.
      ignored: [
        "**/src-tauri/**",
        "**/target/**",
        "**/target-check/**",
        "**/target-codex-check/**",
        "**/DEV_exports/**",
        "**/recovery_snapshots/**",
        "**/tmp-*/**",
        "**/TODO.md",
      ],
    },
  },
  worker: {
    format: "iife",
  },
  optimizeDeps: {
    include: [
      "esm-env",
      "svelte",
      "colorjs.io",
      "bits-ui",
      "@tauri-apps/api/app",
      "@tauri-apps/api/core",
      "@tauri-apps/api/event",
      "@tauri-apps/api/webviewWindow",
      "@tauri-apps/api/window",
      "@tauri-apps/plugin-clipboard-manager",
      "@tauri-apps/plugin-dialog",
      "@tauri-apps/plugin-global-shortcut",
      "@tauri-apps/plugin-opener",
      "@tauri-store/svelte",
      "svelte-sonner",
      "tailwind-merge",
      "tailwind-variants",
    ],
  },
  build: {
    minify: false,
    cssMinify: false,
    reportCompressedSize: false,
  },
}));
