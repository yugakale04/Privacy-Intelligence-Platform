import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

const outputDirectory = new URL("../dist/", import.meta.url);
const publicDirectory = new URL("../public/", import.meta.url);
const backendBaseUrl = (process.env.EXTENSION_BACKEND_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(publicDirectory, outputDirectory, { recursive: true });

const buildOptions = {
  bundle: true,
  platform: "browser",
  target: ["chrome120"],
  define: { __BACKEND_BASE_URL__: JSON.stringify(backendBaseUrl) },
  logLevel: "info"
};

await Promise.all([
  build({ ...buildOptions, entryPoints: ["src/background.ts"], outfile: "dist/background.js", format: "esm" }),
  build({ ...buildOptions, entryPoints: ["src/popup.ts"], outfile: "dist/popup.js", format: "esm" }),
  build({ ...buildOptions, entryPoints: ["src/content.ts"], outfile: "dist/content.js", format: "iife" })
]);
