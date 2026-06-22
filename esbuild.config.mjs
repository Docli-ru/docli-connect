// esbuild bundle for the docli Obsidian plugin. Obsidian loads a single CommonJS `main.js`; the
// `obsidian` module + Electron + Node builtins are provided by the host at runtime (externals).
import esbuild from "esbuild";

const production = process.argv[2] === "production";

// Node builtins the bundler must NOT try to resolve (provided by the Electron host on desktop;
// unused on mobile). Hardcoded so the plugin pulls in no extra dependency just to list them.
const NODE_BUILTINS = [
  "assert", "buffer", "child_process", "crypto", "events", "fs", "http", "https", "net", "os",
  "path", "querystring", "stream", "string_decoder", "tls", "url", "util", "zlib",
];

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  target: "es2022",
  platform: "browser",
  external: ["obsidian", "electron", "@codemirror/*", ...NODE_BUILTINS],
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  logLevel: "info",
  minify: production,
});

if (production) {
  await ctx.rebuild();
  await ctx.dispose();
} else {
  await ctx.watch();
}
