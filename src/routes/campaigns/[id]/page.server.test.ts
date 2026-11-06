import { describe, expect, it } from 'vitest';
import { listSrd } from '$lib/server/features/srd';
import { load, actions } from './+page.server';
import { load as scenarioLoad } from './scenario/+page.server';

const reply = (status: number, body: unknown) =>
	(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

const routed = (campaign: unknown, scenes: unknown) =>
	(async (u: string) => new Response(JSON.stringify(u.endsWith('/scenes') ? scenes : campaign))) as unknown as typeof fetch;

describe('campaign page server', () => {
	it('load throws 404 for unknown campaign', async () => {
		await expect(
			load({ params: { id: 'x' }, fetch: reply(404, { error: 'nf' }) } as never)
		).rejects.toMatchObject({ status: 404 });
	});

	it('load returns the campaign', async () => {
		const r = (await load({ params: { id: 'x' }, fetch: reply(200, { id: 'x', fear: 1 }) } as never)) as unknown as { picks: Record<string, { value: string; label: string }[]> };
		expect(r).toMatchObject({ campaign: { id: 'x', fear: 1 }, chosen: {} });
		expect(r.picks.class).toHaveLength(9);
		expect(r.picks.class[0]).toEqual({ value: 'Bard', label: 'Bard' });
	});

	it('load picks the step from the query, run by default', async () => {
		const step = async (q: string) =>
			((await load({ params: { id: 'x' }, fetch: reply(200, { id: 'x' }), url: new URL(`http://x/${q}`) } as never)) as unknown as { step: string }).step;
		expect(await step('')).toBe('run');
		expect(await step('?step=bogus')).toBe('run');
		expect(await step('?step=build')).toBe('build');
	});

	it('fear action forwards delta', async () => {
		let sent = '';
		const f = (async (_u: string, init: RequestInit) => {
			sent = String(init.body);
			return new Response('{"fear":2}');
		}) as unknown as typeof fetch;
		const request = new Request('http://x', { method: 'POST', body: new URLSearchParams({ delta: '1' }) });
		await (actions.fear as never as (e: unknown) => Promise<unknown>)({ request, params: { id: 'x' }, fetch: f });
		expect(JSON.parse(sent)).toEqual({ delta: 1 });
	});
});

describe('campaign page scene load and actions', () => {
	it('load adds the English environment details', async () => {
		const scenes = [{ id: 's', title: 'T', notes: '', status: 'planned', environmentId: listSrd('environments', 'en')[0].id }, { id: 'p', title: 'P', notes: '', status: 'planned', environmentId: null }];
		const r = (await load({ params: { id: 'x' }, fetch: routed({ characters: [] }, scenes) } as never)) as never as { scenes: { environment: { name: string; features: string[] } | null }[] };
		expect(r.scenes[1].environment).toBeNull();
		expect(r.scenes[0].environment?.name).toBe(listSrd('environments', 'en')[0].name);
		expect(r.scenes[0].environment?.features.length).toBeGreaterThan(0);
	});

	it('actions map API failures to catalog keys', async () => {
		const request = new Request('http://x', { method: 'POST', body: new URLSearchParams({ title: '' }) });
		const res = (await (actions.add as never as (e: unknown) => Promise<{ status: number; data: { error: string } }>)({ request, params: { id: 'x' }, fetch: reply(400, { error: 'English' }) }));
		expect(res.status).toBe(400);
		expect(res.data.error).toBe('error.invalid');
	});

	it('move sends the numeric position', async () => {
		let sent = '';
		const f = (async (_u: string, init: RequestInit) => ((sent = String(init.body)), new Response('[]'))) as unknown as typeof fetch;
		const request = new Request('http://x', { method: 'POST', body: new URLSearchParams({ sceneId: 's', position: '2' }) });
		await (actions.move as never as (e: unknown) => Promise<unknown>)({ request, params: { id: 'x' }, fetch: f });
		expect(JSON.parse(sent)).toEqual({ position: 2 });
	});

	it('roll posts the table, rarity and numeric count to the loot API', async () => {
		let sent: { url: string; body: string } = { url: '', body: '' };
		const f = (async (u: string, init: RequestInit) => ((sent = { url: u, body: String(init.body) }), new Response('[]', { status: 201 }))) as unknown as typeof fetch;
		const request = new Request('http://x', { method: 'POST', body: new URLSearchParams({ sceneId: 's1', table: 'items', rarity: 'rare', count: '3' }) });
		await (actions.roll as never as (e: unknown) => Promise<unknown>)({ request, params: { id: 'c' }, fetch: f });
		expect(sent.url).toBe('/api/campaigns/c/scenes/s1/loot');
		expect(JSON.parse(sent.body)).toEqual({ table: 'items', rarity: 'rare', count: 3 });
	});

	it('load localizes loot names and lists campaign characters', async () => {
		const item = listSrd('items', 'en')[0];
		const scenes = [{ id: 's', title: 'T', notes: '', status: 'planned', environmentId: null, loot: [{ id: 'l', table: 'items', srdId: item.id, roll: 1, name: item.name, given: false }] }];
		const f = routed({ characters: [{ id: 'k', name: 'Zed', class: 'x' }] }, scenes);
		const r = (await load({ params: { id: 'x' }, fetch: f } as never)) as never as { characters: unknown[]; scenes: { loot: { name: string; roll: number; features: string[] }[] }[] };
		expect(r.characters).toEqual([{ id: 'k', name: 'Zed' }]);
		expect(r.scenes[0].loot[0]).toMatchObject({ name: item.name, roll: 1 });
		expect(r.scenes[0].loot[0].features.length).toBeGreaterThan(0);
	});
});

describe('campaign page encounter actions', () => {
	const call = async (name: 'generate' | 'setCount' | 'removeAdversary' | 'deleteEncounter', body: string[][]) => {
		const sent: { url: string; method: string; body: string }[] = [];
		const f = (async (u: string, init: RequestInit) => (sent.push({ url: u, method: init.method!, body: String(init.body) }), new Response('{}', { status: 200 }))) as unknown as typeof fetch;
		const request = new Request('http://x', { method: 'POST', body: new URLSearchParams(body) });
		await (actions[name] as never as (e: unknown) => Promise<unknown>)({ request, params: { id: 'c' }, fetch: f });
		return sent[0];
	};

	it('generate posts numbers and the checked adjustments', async () => {
		const r = await call('generate', [['sceneId', 's'], ['partySize', '4'], ['tier', '2'], ['adjustments', 'harder'], ['adjustments', 'bogus']]);
		expect(r.url).toBe('/api/campaigns/c/scenes/s/encounter');
		expect(JSON.parse(r.body)).toEqual({ partySize: 4, tier: 2, adjustments: ['harder'] });
	});

	it('setCount sends every adversary, removeAdversary drops the removed one', async () => {
		const form = [['sceneId', 's'], ['id', 'a'], ['count', '3'], ['id', 'b'], ['count', '2'], ['remove', 'a']];
		expect(JSON.parse((await call('setCount', form)).body).adversaries).toEqual([{ id: 'a', count: 3 }, { id: 'b', count: 2 }]);
		const r = await call('removeAdversary', form);
		expect(r.method).toBe('PATCH');
		expect(JSON.parse(r.body).adversaries).toEqual([{ id: 'b', count: 2 }]);
	});

	it('deleteEncounter deletes', async () => {
		expect((await call('deleteEncounter', [['sceneId', 's']])).method).toBe('DELETE');
	});
});

describe('scenario redirect', () => {
	it('redirects with 308 to the build step', () => {
		expect(() => scenarioLoad({ params: { id: 'a b' } } as never)).toThrow(
			expect.objectContaining({ status: 308, location: '/campaigns/a%20b?step=build' })
		);
	});
});

describe('campaign page journal', () => {
	const act = (name: string, body: Record<string, string>, f: typeof fetch) =>
		(actions[name] as never as (e: unknown) => Promise<unknown>)({
			request: new Request('http://x', { method: 'POST', body: new URLSearchParams(body) }),
			params: { id: 'c' },
			fetch: f
		});

	it('load formats the entry time as HH:MM', async () => {
		const at = new Date(2026, 0, 2, 9, 5).toISOString();
		const f = (async (u: string) =>
			new Response(JSON.stringify(u.endsWith('/journal') ? [{ id: 'j', text: 'T', createdAt: at }] : { id: 'c', characters: [] }))) as unknown as typeof fetch;
		const r = (await load({ params: { id: 'c' }, fetch: f } as never)) as unknown as { journal: unknown };
		expect(r.journal).toEqual([{ id: 'j', text: 'T', time: '09:05' }]);
	});

	it('addJournal posts the text and maps errors to catalog keys', async () => {
		let sent = '';
		const ok = (async (_u: string, init: RequestInit) => {
			sent = String(init.body);
			return new Response('{}', { status: 201 });
		}) as unknown as typeof fetch;
		expect(await act('addJournal', { text: 'Found a key' }, ok)).toEqual({ ok: true });
		expect(JSON.parse(sent)).toEqual({ text: 'Found a key' });
		expect(await act('addJournal', { text: '' }, reply(400, { error: 'x' }))).toMatchObject({ status: 400, data: { error: 'error.invalid' } });
	});

	it('deleteJournal deletes by entry id and maps 404', async () => {
		let url = '';
		const ok = (async (u: string) => {
			url = u;
			return new Response('{}');
		}) as unknown as typeof fetch;
		await act('deleteJournal', { entryId: 'e1' }, ok);
		expect(url).toBe('/api/campaigns/c/journal/e1');
		expect(await act('deleteJournal', { entryId: 'no' }, reply(404, { error: 'x' }))).toMatchObject({ status: 404, data: { error: 'error.notFound' } });
	});
});
