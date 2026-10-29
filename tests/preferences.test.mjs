import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
const menus = JSON.parse(await readFile(new URL('../content/menus.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('../worker/server.js', import.meta.url), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(`const menus=${JSON.stringify(menus)};\n${source}`).toString('base64')}`);
const sqlite = new DatabaseSync(':memory:');
const DB = { prepare(sql) { let values=[]; return { bind(...args) { values=args; return this; }, async run() { sqlite.prepare(sql).run(...values); }, async all() { return { results:sqlite.prepare(sql).all(...values) }; } }; } };
const target = { menuId: menus[0].id, dishId: menus[0].dishes[0].id };
async function call(user, path, body) {
 return worker.fetch(new Request('https://example.test'+path, { method:body?'PUT':'GET', headers:{...(user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test'}:{}),'content-type':'application/json'}, ...(body?{body:JSON.stringify(body)}:{}) }), {DB, AUTH_MODE:'sites'});
}
test('decisions are shared, user-owned, validated and replaceable; favorites remain personal', async () => {
 assert.equal((await call(null,'/api/decisions',{...target,status:'approved'})).status,401);
 assert.equal((await call('a','/api/decisions',{...target,status:'change',suggestion:''})).status,400);
 assert.equal((await call('a','/api/favorites',{...target,enabled:'true'})).status,400);
 assert.equal((await call('a','/api/decisions',{...target,dishId:'unknown',status:'approved'})).status,400);
 assert.equal((await call('a','/api/decisions',{...target,status:'approved'})).status,200);
 await call('b','/api/decisions',{...target,status:'change',suggestion:'Pizza med tomat'});
 await call('a','/api/favorites',{...target,enabled:true});
 await call('a','/api/favorites',{...target,enabled:true});
 let a=await (await call('a','/api/state')).json();
 let b=await (await call('b','/api/state')).json();
 assert.equal(a.decisions.length,2); assert.equal(a.decisions.find(x=>x.mine).status,'approved');
 assert.equal(b.decisions.find(x=>x.mine).suggestion,'Pizza med tomat');
 assert.equal(a.favorites.length,1); assert.equal(b.favorites.length,0);
 await call('b','/api/decisions',{...target,status:'none'});
 a=await (await call('a','/api/state')).json(); assert.equal(a.decisions.length,1); assert.equal(a.decisions[0].mine,true);
 await call('a','/api/decisions',{...target,status:'change',suggestion:'Laks i stedet'});
 a=await (await call('a','/api/state')).json(); assert.equal(a.decisions.length,1); assert.equal(a.decisions[0].suggestion,'Laks i stedet');
 await call('b','/api/favorites',{...target,enabled:false});
 a=await (await call('a','/api/state')).json(); assert.equal(a.favorites.length,1);
 await call('a','/api/favorites',{...target,enabled:false});
 a=await (await call('a','/api/state')).json(); assert.equal(a.favorites.length,0);
 await call('a','/api/votes',{...target,vote:1}); await call('b','/api/votes',{...target,vote:1});
 a=await (await call('a','/api/state')).json(); assert.equal(a.ratings[0].up,2); assert.equal(a.ratings[0].down,0);
});
