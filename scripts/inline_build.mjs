import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();
const dist = path.join(cwd, "dist");
const html = await readFile(path.join(dist, "index.html"), "utf8");
const cssPath = html.match(/href="\.\/(assets\/index-[^"]+\.css)"/)?.[1];
const jsPath = html.match(/src="\.\/(assets\/index-[^"]+\.js)"/)?.[1];
if (!cssPath || !jsPath) throw new Error("Could not locate built CSS or JS");

const css = await readFile(path.join(dist, cssPath), "utf8");
let js = await readFile(path.join(dist, jsPath), "utf8");

const assets = [
  ["assets/liukanshan-three-quarter-v2.png", "image/png"],
  ["assets/brand/pujiang-forum-logo-white.png", "image/png"],
  ["assets/brand/zhihu-logo-white.png", "image/png"]
];

const speakerAssets = await readdir(path.join(dist, "assets", "speakers"));
for (const filename of speakerAssets.filter((name) => name.endsWith(".webp"))) {
  assets.push([`assets/speakers/${filename}`, "image/webp"]);
}

for (const [assetPath, mime] of assets) {
  const data = await readFile(path.join(dist, assetPath));
  const dataUri = `data:${mime};base64,${data.toString("base64")}`;
  js = js.replaceAll(`./${assetPath}`, dataUri);
  const escapedAssetPath = assetPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  js = js.replace(new RegExp(`\\$\\{[^}]+\\}${escapedAssetPath}`, "g"), dataUri);
}

js = js.replaceAll("</script>", "<\\/script>");
await mkdir(path.join(cwd, "work"), { recursive: true });
await writeFile(path.join(cwd, "work", "inline-debug.js"), js);
const standalone = html
  .replace(
    /\s*<script type="module" crossorigin src="\.\/assets\/index-[^"]+\.js"><\/script>/,
    () => `\n    <script type="module">${js}</script>`
  )
  .replace(
    /\s*<link rel="stylesheet" crossorigin href="\.\/assets\/index-[^"]+\.css">/,
    () => `\n    <style>${css}</style>`
  );

const outputs = path.join(cwd, "outputs");
const upload = path.join(cwd, "work", "github-upload");
await mkdir(outputs, { recursive: true });
await mkdir(upload, { recursive: true });
await writeFile(path.join(outputs, "看山有问-GitHub知乎单文件版.html"), standalone);
await writeFile(path.join(upload, "index.html"), standalone);
console.log(`standalone ${(Buffer.byteLength(standalone) / 1024 / 1024).toFixed(2)} MB`);
