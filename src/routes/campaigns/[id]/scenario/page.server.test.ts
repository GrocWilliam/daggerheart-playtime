import { describe, expect, it } from 'vitest';
import { listSrd } from '$lib/server/features/srd';
import { load, actions } from './+page.server';

const reply = (status: number, body: unknown) =>
	(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('scenario page server', () => {
	it('load 404s for an unknown campaign', async () => {
		await expect(load({ params: { id: 'x' }, fetch: reply(404, {}) } as never)).rejects.toMatchObject({ status: 404 });
	});

	it('load adds the English environment details', async () => {
		const scenes = [{ id: 's', title: 'T', notes: '', status: 'planned', environmentId: listSrd('environments', 'en')[0].id }, { id: 'p', title: 'P', notes: '', status: 'planned', environmentId: null }];
		const r = (await load({ params: { id: 'x' }, fetch: reply(200, scenes) } as never)) as never as { scenes: { environment: { name: string; features: string[] } | null }[] };
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
		const f = (async (u: string) =>
			new Response(JSON.stringify(u.endsWith('/scenes') ? scenes : { characters: [{ id: 'k', name: 'Zed', class: 'x' }] }))) as unknown as typeof fetch;
		const r = (await load({ params: { id: 'x' }, fetch: f } as never)) as never as { characters: unknown[]; scenes: { loot: { name: string; roll: number; features: string[] }[] }[] };
		expect(r.characters).toEqual([{ id: 'k', name: 'Zed' }]);
		expect(r.scenes[0].loot[0]).toMatchObject({ name: item.name, roll: 1 });
		expect(r.scenes[0].loot[0].features.length).toBeGreaterThan(0);
	});
});
