// us-252 criterion: step 3 at level 1 lists only tier 1 armors, the same list as armorGroups(1, lang).
// Runs against the server started by run.sh (US252_BASE) and compares its HTML with armorGroups from srd.ts.
import { describe, expect, it } from 'vitest';
import { armorGroups } from '../../../src/lib/server/features/srd';

const BASE = process.env.US252_BASE ?? '';
const unesc = (s: string) =>
	s.replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const json = (method: string, path: string, body?: unknown) =>
	fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }).then((r) => r.json());

/** Non-empty options of the select named armorId: value and text. */
function armorOptions(html: string) {
	const sel = html.match(/<select[^>]*\bname="?armorId"?[^>]*>([\s\S]*?)<\/select>/);
	expect(sel, 'select[name=armorId]').toBeTruthy();
	return [...sel![1].matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/g)]
		.map((m) => ({ value: unesc((m[1].match(/value="([^"]*)"/) ?? ['', ''])[1]), label: unesc(m[2].replace(/<[^>]*>/g, '').trim()) }))
		.filter((o) => o.value !== '');
}

describe('step 3 armor list', () => {
	it('at level 1 lists only tier 1 armors, the same list as armorGroups(1, lang) (en and fr)', async () => {
		expect(BASE, 'US252_BASE set by run.sh').not.toBe('');
		const cid = (await json('POST', '/api/campaigns', { name: 'Armorcamp' })).id;
		const q = new URLSearchParams({ step: '3', name: 'Ann', class: 'Warrior', level: '1' });
		for (const lang of ['en', 'fr'] as const) {
			const res = await fetch(`${BASE}/campaigns/${cid}/characters/new?${q}`, { headers: { cookie: `lang=${lang}` } });
			expect(res.status).toBe(200);
			const got = armorOptions(await res.text());
			const groups = armorGroups(1, lang);
			expect(groups.every((g) => g.tier === 1)).toBe(true);
			const want = groups.flatMap((g) => g.picks.map((p) => ({ value: p.id, label: p.name })));
			expect(want.length).toBeGreaterThan(0);
			expect(got).toEqual(want);
		}
	});
});
