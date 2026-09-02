import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { mkdirSync, writeFileSync } from "fs";

// PORT is only needed by the dev/preview servers, not by `vite build`.
// In production we serve the built files statically (see artifact.toml),
// so we fall back to a placeholder when PORT is absent (e.g. during
// `pnpm build` in the deployment pipeline).
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5173;

if (rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// BASE_PATH affects asset URLs in the build output; default to "/" when
// missing so production builds don't fail when the env var isn't injected.
const basePath = process.env.BASE_PATH || "/";

// Unique hash stamped into the bundle and written to dist/public/version.json.
// The client polls version.json and reloads when the hash changes.
const buildHash = Date.now().toString(36);

function versionJsonPlugin(): Plugin {
  return {
    name: "version-json",
    apply: "build",
    closeBundle() {
      const outDir = path.resolve(import.meta.dirname, "dist/public");
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        path.join(outDir, "version.json"),
        JSON.stringify({ hash: buildHash }),
      );
    },
  };
}

export default defineConfig({
  base: basePath,
  define: {
    "import.meta.env.VITE_BUILD_HASH": JSON.stringify(buildHash),
  },
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    versionJsonPlugin(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
