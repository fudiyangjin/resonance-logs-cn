import devtoolsJson from "vite-plugin-devtools-json";
// @ts-ignore
import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import Icons from 'unplugin-icons/vite'

const loopbackHost = "127.0.0.1";

// https://vitejs.dev/config/
// @ts-ignore
export default defineConfig(async () => ({
  plugins: [
    sveltekit(), 
    tailwindcss(), 
    devtoolsJson(),
    // https://icones.js.org/
    Icons({ 
      compiler: 'svelte',
      // experimental
      autoInstall: true, 
    })],
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: loopbackHost,
    hmr: { protocol: "ws", host: loopbackHost, port: 1421 },
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
