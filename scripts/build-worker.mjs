import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const [html, css, client, source, menusRaw] = await Promise.all([
  readFile(resolve(root, "worker/index.html"), "utf8"),
  readFile(resolve(root, "worker/style.css"), "utf8"),
  readFile(resolve(root, "worker/client.js"), "utf8"),
  readFile(resolve(root, "worker/server.js"), "utf8"),
  readFile(resolve(root, "content/menus.json"), "utf8"),
]);
const menus = JSON.parse(menusRaw);
if (!Array.isArray(menus) || menus.length === 0) throw new Error("Invalid menu data");
const output = source
  .replace("/*__PAGE__*/", `const page = ${JSON.stringify(html)};`)
  .replace("/*__STYLE__*/", `const style = ${JSON.stringify(css)};`)
  .replace("/*__CLIENT__*/", `const client = ${JSON.stringify(client)};`)
  .replace("/*__MENUS__*/", `const menus = ${JSON.stringify(menus)};`);
if (output.includes("/*__")) throw new Error("Unreplaced build marker");
const dist = resolve(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, "server"), { recursive: true });
await writeFile(resolve(dist, "server/index.js"), output);
console.log(`Built ${dist}`);
