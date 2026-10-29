import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
const menus = JSON.parse(await readFile(new URL('../content/menus.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('../worker/server.js', import.meta.url), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(`const menus=${JSON.stringify(menus)};\n${source}`).toString('base64')}`);
const sqlite = new DatabaseSync(':memory:');
const DB = { prepare(sql) { let values=[]; return { bind(...args) { values=args; return this; }, async run() { const result=sqlite.prepare(sql).run(...values); return {meta:{changes:Number(result.changes)}}; }, async all() { return { results:sqlite.prepare(sql).all(...values) }; } }; } };

async function call(user, path, body) {
 return worker.fetch(new Request('https://example.test'+path, { method:body?'PUT':'GET', headers:{...(user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test'}:{}),'content-type':'application/json'}, ...(body?{body:JSON.stringify(body)}:{}) }), {DB, AUTH_MODE:'sites'});
}
test('inventory quantities, units, uncertainty and concurrent edits are preserved correctly', async () => {
 const rice={name:'Jasminris',certainty:'approx',quantity:1,unit:'kg',note:'Tørr vekt',revision:0};
 assert.equal((await call(null,'/api/pantry',rice)).status,401);
 for(const invalid of [{quantity:-2},{quantity:0},{quantity:'1'},{unit:'pose'},{certainty:'maybe'},{revision:-1}]) {
   assert.equal((await call('a','/api/pantry',{...rice,...invalid})).status,400);
 }
 assert.equal((await call('a','/api/pantry',rice)).status,200);
 let items=(await (await call('b','/api/pantry')).json()).items;
 assert.equal(items[0].quantity,1); assert.equal(items[0].certainty,'approx');
 assert.deepEqual(items[0].normalized,{quantity:1000,unit:'g'});
 assert.equal(items[0].displayName,'a'); assert.equal(items[0].revision,1);
 assert.equal((await call('b','/api/pantry',{...rice,name:'jasminris'})).status,409);
 assert.equal((await call('b','/api/pantry',{...rice,quantity:0.5,revision:1})).status,200);
 assert.equal((await call('a','/api/pantry',{...rice,quantity:0.2,revision:1})).status,409);
 items=(await (await call('a','/api/pantry')).json()).items;
 assert.equal(items[0].quantity,0.5); assert.equal(items[0].displayName,'b');
 const packs={name:'Kokosmelk',certainty:'exact',quantity:2,unit:'pakker',packageSize:400,packageUnit:'ml',revision:0};
 assert.equal((await call('a','/api/pantry',packs)).status,200);
 items=(await (await call('a','/api/pantry')).json()).items;
 assert.deepEqual(items.find(x=>x.name==='Kokosmelk').normalized,{quantity:800,unit:'ml'});
 assert.equal((await call('a','/api/pantry',{...packs,packageSize:null,revision:1})).status,200);
 items=(await (await call('a','/api/pantry')).json()).items;
 assert.equal(items.find(x=>x.name==='Kokosmelk').normalized,null);
 assert.equal((await call('a','/api/pantry',{...rice,certainty:'unknown',revision:2})).status,200);
 items=(await (await call('a','/api/pantry')).json()).items;
 assert.equal(items[0].quantity,null); assert.equal(items[0].normalized,null);
 assert.equal((await call('a','/api/pantry',{...rice,certainty:'empty',revision:3})).status,200);
 items=(await (await call('a','/api/pantry')).json()).items;
 assert.equal(items[0].quantity,0); assert.equal(items[0].certainty,'empty');
});
