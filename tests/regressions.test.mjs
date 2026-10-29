import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const client = (await readFile(new URL("../worker/client.js", import.meta.url), "utf8")).replace("void start();", "");
function clientHarness() {
  const pending = [];
  const elements = new Map();
  const context = vm.createContext({
    fetch: (url) => new Promise((resolve, reject) => pending.push({ url, resolve, reject })),
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } },
  });
  vm.runInContext(client + "\nrenderVotes=()=>{}; renderRequests=()=>{}; renderPlanning=()=>{}; renderLibrary=()=>{};", context);
  return { context, pending, elements };
}
const response = (from) => ({ ok: true, json: async () => ({ from, displayName: "Test", votes: {}, requests: [] }) });

test("a delayed response cannot replace the currently selected week's data", async () => {
  const { context, pending } = clientHarness();
  vm.runInContext('currentMenuId="A"; globalThis.first=refresh(); currentMenuId="B"; globalThis.second=refresh();', context);
  pending[1].resolve(response("B")); await context.second;
  pending[0].resolve(response("A")); await context.first;
  assert.equal(vm.runInContext("shared.from", context), "B");
});

test("latest refresh wins even when both requests refer to the same week", async () => {
  const { context, pending } = clientHarness();
  vm.runInContext('currentMenuId="A"; globalThis.first=refresh(); globalThis.second=refresh();', context);
  pending[1].resolve(response("new")); await context.second;
  pending[0].resolve(response("old")); await context.first;
  assert.equal(vm.runInContext("shared.from", context), "new");
});

test("a stale failed request cannot replace a successful screen with an error", async () => {
  const { context, pending, elements } = clientHarness();
  vm.runInContext('currentMenuId="A"; globalThis.first=refresh(); currentMenuId="B"; globalThis.second=refresh();', context);
  pending[1].resolve(response("B")); await context.second;
  pending[0].reject(new Error("old failure")); await context.first;
  assert.equal(elements.get("feedback-error").textContent, "");
});

test("all four API operations return JSON 500 when D1 rejects an operation", async () => {
  const source = await readFile(new URL("../worker/server.js", import.meta.url), "utf8");
  const menus = JSON.parse(await readFile(new URL("../content/menus.json", import.meta.url), "utf8"));
  const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(`const menus=${JSON.stringify(menus)};\n${source}`).toString("base64")}`);
  const DB = { prepare(sql) { return {
    bind() { return this; },
    async run() { if (!sql.startsWith("CREATE")) throw new Error("simulated D1 failure"); },
    async all() { throw new Error("simulated D1 failure"); },
  }; } };
  const operations = [
    ["GET", "/api/state", null],
    ["PUT", "/api/votes", { menuId: menus[0].id, dishId: menus[0].dishes[0].id, vote: 1 }],
    ["POST", "/api/requests", { item: "Tomater" }],
    ["DELETE", "/api/requests", { id: "test" }],
  ];
  for (const [method, path, body] of operations) {
    const result = await worker.fetch(new Request(`https://example.test${path}`, {
      method, headers: { "oai-authenticated-user-id": "test", "oai-authenticated-user-email": "test@example.test", "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }), { DB, AUTH_MODE: "sites" });
    assert.equal(result.status, 500, path);
    assert.deepEqual(await result.json(), { error: "Kunne ikke lagre eller hente data akkurat nå" });
  }
});
