// Bundles our source (incl. .tsx pages) into dist/app.js for the Vercel function.
// Vercel's per-file TS compile doesn't trace .tsx imports, so we bundle first;
// npm packages stay external and are traced/installed by Vercel as usual.
import { mkdir, writeFile } from "node:fs/promises";
import { build } from "esbuild";

await build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/app.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  jsx: "automatic",
  jsxImportSource: "hono/jsx",
  sourcemap: true,
  logLevel: "info",
});

// No static assets — everything is served by the function — but Vercel requires an output dir.
await mkdir("public", { recursive: true });
await writeFile("public/.gitkeep", "");
