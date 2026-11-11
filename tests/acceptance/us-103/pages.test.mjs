import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL;
const NNBSP = ' ';

async function api(method, url, body) {
	const res = await fetch(BASE + url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
	return { status: res.status, json: await res.json().catch(() => undefined) };
}
async function page(url, lang) {
	const res = await fetch(BASE + url, { headers: { cookie: `lang=${lang}` } });
	assert.equal(res.status, 200);
	// collapse only [ \t\r\n]: \s would also match U+202F
	return (await res.text()).replace(/[ \t\r\n]+/g, ' ');
}
async function setup() {
	const camp = (await api('POST', '/api/campaigns', { name: 'C' })).json;
	const ch = (await api('POST', `/api/campaigns/${camp.id}/characters`, { name: 'Ayla', class: 'Ranger', level: 1, evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, maxStress: 6, armorSlots: 3 })).json;
	return ch;
}

test('gold above 999 is grouped per language (U+202F in fr)', async () => {
	const ch = await setup();
	// 123400 handfuls = 1234 chests, 0 bags, 0 handfuls
	assert.equal((await api('POST', `/api/characters/${ch.id}/gold`, { handfuls: 123400 })).json.gold.chests, 1234);
	const en = await page(`/characters/${ch.id}?tab=gear`, 'en');
	assert.match(en, /data-testid="gold"[^>]*>1,234 chests, 0 bags, 0 handfuls</);
	const fr = await page(`/characters/${ch.id}?tab=gear`, 'fr');
	assert.ok(fr.includes(`>1${NNBSP}234 `), 'fr gold uses U+202F');
	assert.doesNotMatch(fr, /1,234|1 234 /);
});

test('item quantity from 1,000 to 999,999 is grouped per language', async () => {
	const ch = await setup();
	const it = await api('POST', `/api/characters/${ch.id}/items`, { name: 'Arrow', quantity: 1234 });
	assert.equal(it.status, 201);
	const en = await page(`/characters/${ch.id}?tab=gear`, 'en');
	assert.match(en, /Arrow ×1,234</);
	const fr = await page(`/characters/${ch.id}?tab=gear`, 'fr');
	assert.ok(fr.includes(`Arrow ×1${NNBSP}234<`), 'fr quantity uses U+202F');
	assert.doesNotMatch(fr, /1,234/);
});

test('values below 1000 are unchanged', async () => {
	const ch = await setup();
	await api('POST', `/api/characters/${ch.id}/gold`, { handfuls: 456 });
	await api('POST', `/api/characters/${ch.id}/items`, { name: 'Rope', quantity: 999 });
	for (const lang of ['en', 'fr']) {
		const h = await page(`/characters/${ch.id}?tab=gear`, lang);
		assert.match(h, /data-testid="gold"[^>]*>4 [^,]*, 5 [^,]*, 6 /);
		assert.match(h, /Rope ×999</);
		assert.ok(!h.includes(NNBSP + '999'), 'no separator in 999');
	}
});
