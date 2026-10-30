import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// The collector script lives in ../collector. The viewer serves a copy of it, so the
// "How do I get a .vcfapkg?" download always matches the version that was built.
const COLLECTOR = resolve(__dirname, "../collector/Export-VCFALedgerPackage.ps1");
const collectorVersion = existsSync(COLLECTOR) ? (/\$ToolVersion\s*=\s*'([^']+)'/.exec(readFileSync(COLLECTOR, "utf8"))?.[1] ?? "") : "";

function copyCollector(): Plugin {
  return {
    name: "copy-collector",
    buildStart() {
      if (!existsSync(COLLECTOR)) return;
      const out = resolve(__dirname, "public/collector");
      mkdirSync(out, { recursive: true });
      copyFileSync(COLLECTOR, resolve(out, "Export-VCFALedgerPackage.ps1"));
    },
  };
}

// `vite build` -> normal static build for Vercel (dist/)
// `vite build --mode single` -> one self-contained HTML file (dist-single/index.html)
export default defineConfig(({ mode }) => ({
  plugins: mode === "single" ? [copyCollector(), react(), viteSingleFile()] : [copyCollector(), react()],
  define: { __COLLECTOR_VERSION__: JSON.stringify(collectorVersion) },
  build: {
    outDir: mode === "single" ? "dist-single" : "dist",
    chunkSizeWarningLimit: 1500,
  },
}));
