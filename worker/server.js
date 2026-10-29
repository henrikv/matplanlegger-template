/*__PAGE__*/
/*__STYLE__*/
/*__CLIENT__*/
/*__MENUS__*/

let readyPromise;
function ensureTables(db) {
  if (!readyPromise) {
    readyPromise = (async () => {
      await db.prepare("CREATE TABLE IF NOT EXISTS votes (menu_id TEXT NOT NULL, dish_id TEXT NOT NULL, user_id TEXT NOT NULL, vote INTEGER NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (menu_id, dish_id, user_id))").run();
      await db.prepare("CREATE TABLE IF NOT EXISTS shopping_requests (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, display_name TEXT NOT NULL, item TEXT NOT NULL, created_at TEXT NOT NULL)").run();
      await db.prepare("CREATE TABLE IF NOT EXISTS meal_decisions (menu_id TEXT NOT NULL, dish_id TEXT NOT NULL, user_id TEXT NOT NULL, display_name TEXT NOT NULL, status TEXT NOT NULL, suggestion TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (menu_id, dish_id, user_id))").run();
      await db.prepare("CREATE TABLE IF NOT EXISTS favorites (menu_id TEXT NOT NULL, dish_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (menu_id, dish_id, user_id))").run();
      await db.prepare("CREATE TABLE IF NOT EXISTS pantry (item_key TEXT PRIMARY KEY, name TEXT NOT NULL, certainty TEXT NOT NULL, quantity REAL, unit TEXT NOT NULL, package_size REAL, package_unit TEXT NOT NULL, note TEXT NOT NULL, updated_at TEXT NOT NULL, display_name TEXT NOT NULL, revision INTEGER NOT NULL)").run();
    })().catch((error) => { readyPromise = undefined; throw error; });
  }
  return readyPromise;
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

function base64UrlBytes(value) {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

let accessKeys;
async function accessKey(teamDomain, kid) {
  if (!accessKeys || !accessKeys.has(kid)) {
    const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
    if (!response.ok) return null;
    const { keys = [] } = await response.json();
    accessKeys = new Map(await Promise.all(keys.map(async (jwk) => [jwk.kid, await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"])])));
  }
  return accessKeys.get(kid) || null;
}

// Cloudflare Access: verify the signed JWT, never trust plain identity headers.
async function accessUser(request, env) {
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return null;
  try {
    const { kid, alg } = JSON.parse(new TextDecoder().decode(base64UrlBytes(header)));
    if (alg !== "RS256") return null;
    const key = await accessKey(env.ACCESS_TEAM_DOMAIN, kid);
    if (!key) return null;
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64UrlBytes(signature), new TextEncoder().encode(`${header}.${payload}`));
    if (!valid) return null;
    const claims = JSON.parse(new TextDecoder().decode(base64UrlBytes(payload)));
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(env.ACCESS_AUD) || claims.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now() || typeof claims.email !== "string") return null;
    const email = claims.email.toLowerCase();
    let names = {};
    try { names = JSON.parse(env.DISPLAY_NAMES || "{}"); } catch { /* use email prefix */ }
    return { id: email, name: names[email] || email.split("@")[0] };
  } catch {
    return null;
  }
}

// Default is Cloudflare Access. AUTH_MODE "sites" trusts platform identity headers and is only for
// hosts that strip them at the edge, plus tests and the local preview.
function currentUser(request, env) {
  if (env.AUTH_MODE !== "sites") return accessUser(request, env);
  const id = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email");
  if (!id || !email) return null;
  let name = email.split("@")[0];
  const encoded = request.headers.get("oai-authenticated-user-full-name");
  if (encoded && request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try { name = decodeURIComponent(encoded); } catch { /* use email prefix */ }
  }
  return { id, name };
}

async function parseBody(request) {
  try { return await request.json(); } catch { return null; }
}

async function getState(request, db, user) {
  const menuId = new URL(request.url).searchParams.get("menuId") || menus[0].id;
  const menu = menus.find((entry) => entry.id === menuId);
  if (!menu) return json({ error: "Ukjent meny" }, 400);
  const [voteRows, requestRows, decisionRows, favoriteRows, allVotes] = await Promise.all([
    db.prepare("SELECT dish_id, user_id, vote FROM votes WHERE menu_id = ?").bind(menuId).all(),
    db.prepare("SELECT id, user_id, display_name, item, created_at FROM shopping_requests ORDER BY created_at DESC").all(),
    db.prepare("SELECT dish_id, user_id, display_name, status, suggestion FROM meal_decisions WHERE menu_id = ?").bind(menuId).all(),
    db.prepare("SELECT menu_id, dish_id FROM favorites WHERE user_id = ?").bind(user.id).all(),
    db.prepare("SELECT menu_id, dish_id, SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) AS up, SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) AS down FROM votes GROUP BY menu_id, dish_id").all(),
  ]);
  const votes = Object.fromEntries(menu.dishes.map((dish) => [dish.id, { up: 0, down: 0, mine: 0 }]));
  for (const row of voteRows.results || []) {
    const result = votes[row.dish_id];
    if (!result) continue;
    if (row.vote === 1) result.up += 1;
    if (row.vote === -1) result.down += 1;
    if (row.user_id === user.id) result.mine = row.vote;
  }
  return json({
    displayName: user.name,
    votes,
    decisions: (decisionRows.results || []).map(row => ({ dishId: row.dish_id, displayName: row.display_name, status: row.status, suggestion: row.suggestion, mine: row.user_id === user.id })),
    favorites: (favoriteRows.results || []).map(row => ({ menuId: row.menu_id, dishId: row.dish_id })),
    ratings: (allVotes.results || []).map(row => ({ menuId: row.menu_id, dishId: row.dish_id, up: row.up, down: row.down })),
    requests: (requestRows.results || []).map((row) => ({
      id: row.id,
      item: row.item,
      displayName: row.display_name,
      createdAt: row.created_at,
      mine: row.user_id === user.id,
    })),
  });
}

async function putVote(request, db, user) {
  const body = await parseBody(request);
  if (!body || typeof body.menuId !== "string" || typeof body.dishId !== "string" || ![-1, 0, 1].includes(body.vote)) return json({ error: "Ugyldig vurdering" }, 400);
  const menu = menus.find((entry) => entry.id === body.menuId);
  if (!menu || !menu.dishes.some((dish) => dish.id === body.dishId)) return json({ error: "Ukjent middag" }, 400);
  if (body.vote === 0) {
    await db.prepare("DELETE FROM votes WHERE menu_id = ? AND dish_id = ? AND user_id = ?").bind(body.menuId, body.dishId, user.id).run();
  } else {
    await db.prepare("INSERT INTO votes (menu_id, dish_id, user_id, vote, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(menu_id, dish_id, user_id) DO UPDATE SET vote = excluded.vote, updated_at = excluded.updated_at")
      .bind(body.menuId, body.dishId, user.id, body.vote, new Date().toISOString()).run();
  }
  return json({ ok: true });
}

async function postRequest(request, db, user) {
  const body = await parseBody(request);
  const item = typeof body?.item === "string" ? body.item.trim().replace(/\s+/g, " ") : "";
  if (item.length < 2 || item.length > 180) return json({ error: "Skriv 2–180 tegn" }, 400);
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO shopping_requests (id, user_id, display_name, item, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, user.id, user.name, item, new Date().toISOString()).run();
  return json({ ok: true, id });
}

async function deleteRequest(request, db, user) {
  const body = await parseBody(request);
  if (typeof body?.id !== "string" || !body.id) return json({ error: "Ugyldig ønske" }, 400);
  await db.prepare("DELETE FROM shopping_requests WHERE id = ? AND user_id = ?").bind(body.id, user.id).run();
  return json({ ok: true });
}

async function putMealPreference(request, db, user, favorite) {
  const body = await parseBody(request);
  const selected = menus.find(entry => entry.id === body?.menuId);
  if (!selected?.dishes.some(dish => dish.id === body?.dishId)) return json({ error: "Ukjent middag" }, 400);
  if (favorite) {
    if (typeof body.enabled !== "boolean") return json({ error: "Ugyldig favoritt" }, 400);
    if (body.enabled) await db.prepare("INSERT OR IGNORE INTO favorites (menu_id, dish_id, user_id) VALUES (?, ?, ?)").bind(body.menuId, body.dishId, user.id).run();
    else await db.prepare("DELETE FROM favorites WHERE menu_id = ? AND dish_id = ? AND user_id = ?").bind(body.menuId, body.dishId, user.id).run();
  } else {
    if (!["approved", "change", "none"].includes(body.status)) return json({ error: "Ugyldig middagsvalg" }, 400);
    const suggestion = typeof body.suggestion === "string" ? body.suggestion.trim() : "";
    if (body.status === "change" && (suggestion.length < 2 || suggestion.length > 300)) return json({ error: "Beskriv alternativet med 2–300 tegn" }, 400);
    if (body.status === "none") await db.prepare("DELETE FROM meal_decisions WHERE menu_id = ? AND dish_id = ? AND user_id = ?").bind(body.menuId, body.dishId, user.id).run();
    else await db.prepare("INSERT INTO meal_decisions (menu_id, dish_id, user_id, display_name, status, suggestion, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(menu_id, dish_id, user_id) DO UPDATE SET display_name = excluded.display_name, status = excluded.status, suggestion = excluded.suggestion, updated_at = excluded.updated_at")
      .bind(body.menuId, body.dishId, user.id, user.name, body.status, body.status === "change" ? suggestion : "", new Date().toISOString()).run();
  }
  return json({ ok: true });
}

function pantryItem(row) {
  const factors = { g: 1, kg: 1000, ml: 1, l: 1000, stk: 1 };
  const unit = row.unit === 'pakker' ? row.package_unit : row.unit;
  const amount = row.unit === 'pakker' ? (row.package_size === null ? null : row.quantity * row.package_size) : row.quantity;
  const known = ['exact', 'approx'].includes(row.certainty) && amount !== null && factors[unit];
  return { key: row.item_key, name: row.name, certainty: row.certainty, quantity: row.quantity, unit: row.unit,
    packageSize: row.package_size, packageUnit: row.package_unit, note: row.note, updatedAt: row.updated_at,
    displayName: row.display_name, revision: row.revision,
    normalized: known ? { quantity: Math.round(amount * factors[unit] * 1000) / 1000, unit: ['g','kg'].includes(unit) ? 'g' : ['ml','l'].includes(unit) ? 'ml' : 'stk' } : null };
}
async function getPantry(db) {
  const rows = await db.prepare('SELECT * FROM pantry ORDER BY name COLLATE NOCASE').all();
  return json({ items: (rows.results || []).map(pantryItem) });
}
async function putPantry(request, db, user) {
  const body = await parseBody(request);
  const name = typeof body?.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  if (name.length < 2 || name.length > 80 || note.length > 200 || !['exact','approx','unknown','empty'].includes(body?.certainty) || !Number.isInteger(body?.revision) || body.revision < 0) return json({ error: 'Kontroller varenavn, status og merknad' }, 400);
  const known = ['exact','approx'].includes(body.certainty);
  const validAmount = value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 100000;
  if (known && (!validAmount(body.quantity) || !['g','kg','ml','l','stk','pakker'].includes(body.unit))) return json({ error: 'Oppgi en positiv mengde og velg enhet. Bruk Tomt hvis det ikke er noe igjen.' }, 400);
  const packaged = known && body.unit === 'pakker';
  const hasSize = packaged && body.packageSize != null;
  if (hasSize && (!validAmount(body.packageSize) || !['g','kg','ml','l','stk'].includes(body.packageUnit))) return json({ error: 'Kontroller pakningsstørrelsen' }, 400);
  const values = [name.toLocaleLowerCase('nb-NO'), name, body.certainty, known ? body.quantity : body.certainty === 'empty' ? 0 : null, known ? body.unit : '', hasSize ? body.packageSize : null, hasSize ? body.packageUnit : '', note, new Date().toISOString(), user.name];
  let result;
  if (body.revision === 0) {
    result = await db.prepare('INSERT OR IGNORE INTO pantry (item_key, name, certainty, quantity, unit, package_size, package_unit, note, updated_at, display_name, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)').bind(...values).run();
  } else {
    result = await db.prepare('UPDATE pantry SET name = ?, certainty = ?, quantity = ?, unit = ?, package_size = ?, package_unit = ?, note = ?, updated_at = ?, display_name = ?, revision = revision + 1 WHERE item_key = ? AND revision = ?').bind(...values.slice(1), values[0], body.revision).run();
  }
  if (!result.meta?.changes) return json({ error: 'Varen finnes allerede eller er endret av den andre. Hent siste lagerstatus og åpne varen på nytt.' }, 409);
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    // With Access the Worker checks every request itself, including the page and assets.
    const user = await currentUser(request, env);
    if (env.AUTH_MODE !== "sites" && !user) return new Response("Ikke tilgang", { status: 403, headers: { "cache-control": "no-store" } });
    if (request.method === "GET" && path === "/style.css") return new Response(style, { headers: { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=3600" } });
    if (request.method === "GET" && path === "/app.js") return new Response(client, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=3600" } });
    if (request.method === "GET" && path === "/menus.json") return json(menus);
    if (request.method === "GET" && path === "/") return new Response(page, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    if (!path.startsWith("/api/")) return new Response("Fant ikke siden", { status: 404 });

    if (!user) return json({ error: "Logg inn for å bruke familiemenyen" }, 401);
    if (!env.DB) return json({ error: "Lagring er ikke tilgjengelig" }, 503);
    try {
      await ensureTables(env.DB);
      if (path === "/api/pantry" && request.method === "GET") return await getPantry(env.DB);
      if (path === "/api/pantry" && request.method === "PUT") return await putPantry(request, env.DB, user);
      if (path === "/api/decisions" && request.method === "PUT") return await putMealPreference(request, env.DB, user, false);
      if (path === "/api/favorites" && request.method === "PUT") return await putMealPreference(request, env.DB, user, true);
      if (path === "/api/state" && request.method === "GET") return await getState(request, env.DB, user);
      if (path === "/api/votes" && request.method === "PUT") return await putVote(request, env.DB, user);
      if (path === "/api/requests" && request.method === "POST") return await postRequest(request, env.DB, user);
      if (path === "/api/requests" && request.method === "DELETE") return await deleteRequest(request, env.DB, user);
      return json({ error: "Fant ikke handlingen" }, 404);
    } catch (error) {
      console.error("Menu storage error", error);
      return json({ error: "Kunne ikke lagre eller hente data akkurat nå" }, 500);
    }
  },
};
