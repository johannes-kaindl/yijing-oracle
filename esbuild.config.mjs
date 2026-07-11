// Build → main.js (PROF-TS-02). obsidian/electron sind extern (vom Host bereitgestellt).
// Die Hexagramm-JSONs werden mit-gebundelt (esbuild json-loader) — ein einziges main.js,
// keine Sidecar-Assets, sofort offline (siehe Spec §3 Daten-Bundling).
import esbuild from "esbuild";

const prod = process.argv.includes("--production");

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "node:*"],
  format: "cjs",
  target: "es2022",
  loader: { ".json": "json" },
  sourcemap: prod ? false : "inline",
  minify: prod,
  treeShaking: true,
  outfile: "main.js",
});

if (prod) {
  await ctx.rebuild();
  await ctx.dispose();
} else {
  await ctx.watch();
  console.log("esbuild: watching…");
}
