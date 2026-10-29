import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
const menus = JSON.parse(await readFile(new URL('../content/menus.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('../worker/server.js', import.meta.url), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(`const page="";const style="";const client="";const menus=${JSON.stringify(menus)};\n${source}`).toString('base64')}`);
const sqlite = new DatabaseSync(':memory:');
const DB = { prepare(sql) { let values=[]; return { bind(...args) { values=args; return this; }, async run() { const result=sqlite.prepare(sql).run(...values); return {meta:{changes:Number(result.changes)}}; }, async all() { return { results:sqlite.prepare(sql).all(...values) }; } }; } };

const team = 'familie.cloudflareaccess.com';
const env = { DB, ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: 'aud-123', DISPLAY_NAMES: JSON.stringify({ 'pappa@example.test': 'Pappa' }) };
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1' };
globalThis.fetch = async (url) => {
 assert.equal(String(url), `https://${team}/cdn-cgi/access/certs`);
 return Response.json({ keys: [jwk] });
};
const b64 = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
async function token(claims) {
 const body = `${b64({ alg: 'RS256', kid: 'k1' })}.${b64({ aud: ['aud-123'], iss: `https://${team}`, exp: Math.floor(Date.now() / 1000) + 600, email: 'Pappa@example.test', ...claims })}`;
 return `${body}.${Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(body))).toString('base64url')}`;
}
const call = (jwt, path = '/api/state', callEnv = env) => worker.fetch(new Request('https://example.test' + path, { headers: jwt ? { 'cf-access-jwt-assertion': jwt } : { 'oai-authenticated-user-id': 'x', 'oai-authenticated-user-email': 'x@example.test' } }), callEnv);

test('access mode requires a valid Cloudflare Access token for every path', async () => {
 const valid = await token({});
 const state = await call(valid);
 assert.equal(state.status, 200);
 assert.equal((await state.json()).displayName, 'Pappa');
 assert.equal((await call(valid, '/')).status, 200);
 assert.equal((await call(null, '/')).status, 403);
 assert.equal((await call(null)).status, 403);
 assert.equal((await call(await token({ aud: ['other'] }))).status, 403);
 assert.equal((await call(await token({ iss: 'https://evil.example' }))).status, 403);
 assert.equal((await call(await token({ exp: Math.floor(Date.now() / 1000) - 10 }))).status, 403);
 assert.equal((await call(valid.slice(0, -4) + 'AAAA')).status, 403);
 assert.equal((await call(valid, '/api/state', { ...env, ACCESS_AUD: undefined })).status, 403);
 assert.equal((await call(null, '/api/state', { DB })).status, 403);
});
