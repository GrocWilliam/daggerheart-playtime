import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL;
const get = async (url, lang) => (await fetch(BASE + url, { headers: { cookie: `lang=${lang}` } })).text();
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
function options(html, name) {
	const sel = html.match(new RegExp(`<select[^>]*name="?${name}"?[^>]*>([\\s\\S]*?)</select>`));
	assert.ok(sel, `select ${name}`);
	return [...sel[1].matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/g)]
		.map((m) => ({ value: unesc((m[1].match(/value="([^"]*)"/) || [, ''])[1]), label: unesc(m[2].trim()) }))
		.filter((o) => o.value !== '');
}

// us-197: the DM screen's inline add-character form became the character tunnel, whose selects use the same
// pickOptions: class on step 1, ancestry and community on step 2.
test('tunnel selects render SRD options: English values, localised labels', async () => {
	const cid = (await (await fetch(BASE + '/api/campaigns', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Opt' }) })).json()).id;
	const pageOf = { class: `/campaigns/${cid}/characters/new`, ancestry: `/campaigns/${cid}/characters/new?step=2&name=Opt&class=Bard&level=1` };
	pageOf.community = pageOf.ancestry;
	for (const [sel, kind] of [['class', 'classes'], ['ancestry', 'ancestries'], ['community', 'communities']]) {
		const en = await (await fetch(`${BASE}/api/srd/${kind}`, { headers: { cookie: 'lang=en' } })).json();
		const fr = await (await fetch(`${BASE}/api/srd/${kind}`, { headers: { cookie: 'lang=fr' } })).json();
		for (const lang of ['en', 'fr']) {
			const o = options(await get(pageOf[sel], lang), sel);
			assert.deepEqual(o.map((x) => x.value), en.map((x) => x.name), `${sel} values ${lang}`);
			assert.deepEqual(o.map((x) => x.label), (lang === 'fr' ? fr : en).map((x) => x.name), `${sel} labels ${lang}`);
		}
	}
});
