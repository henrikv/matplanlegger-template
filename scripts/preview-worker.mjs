// Local-only preview. This file is never included in the deployed Worker.
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../dist/server/index.js", import.meta.url), "utf8");
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const sqlite = new DatabaseSync(":memory:");
const DB = {
  prepare(sql) {
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      async run() { const result = sqlite.prepare(sql).run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
      async all() { return { results: sqlite.prepare(sql).all(...values) }; },
    };
  },
};
const port = Number(process.env.PORT || 5173);
const origin = `http://127.0.0.1:${port}`;
const server = createServer(async (incoming, outgoing) => {
  try {
    // Reject browser requests from other origins; preview uses a local test identity.
    if (incoming.headers.host !== `127.0.0.1:${port}` ||
        (incoming.headers.origin && incoming.headers.origin !== origin)) {
      outgoing.writeHead(403).end(); return;
    }
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const headers = new Headers();
    if (incoming.headers["content-type"]) headers.set("content-type", incoming.headers["content-type"]);
    headers.set("oai-authenticated-user-id", "local-preview");
    headers.set("oai-authenticated-user-email", "preview@example.test");
    const method = incoming.method || "GET";
    const request = new Request(new URL(incoming.url, origin), {
      method, headers, ...(method === "GET" || method === "HEAD" ? {} : { body: Buffer.concat(chunks) }),
    });
    const response = await worker.fetch(request, { DB, AUTH_MODE: "sites" });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500, { "content-type": "text/plain" }).end("Local preview error");
  }
});
server.listen(port, "127.0.0.1", () => console.log(`Local preview: ${origin} (test user; data resets on restart)`));
