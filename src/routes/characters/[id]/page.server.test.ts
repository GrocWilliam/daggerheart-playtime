import { describe, expect, it } from 'vitest';
import { load, actions } from './+page.server';

type Act = (e: unknown) => Promise<unknown>;

function recorder(status = 200, body: unknown = {}) {
	const calls: { url: string; method: string; body: unknown }[] = [];
	const f = (async (url: string, init: RequestInit) => {
		calls.push({ url, method: init.method!, body: init.body ? JSON.parse(String(init.body)) : undefined });
		return new Response(JSON.stringify(body), { status });
	}) as unknown as typeof fetch;
	return { calls, f };
}
const run = (name: keyof typeof actions, fields: Record<string, string>, f: typeof fetch) =>
	(actions[name] as never as Act)({
		request: new Request('http://x', { method: 'POST', body: new URLSearchParams(fields) }),
		params: { id: 'c1' },
		fetch: f
	});

describe('character page server', () => {
	it('load 404s for unknown character', async () => {
		const { f } = recorder(404, { error: 'nf' });
		await expect(load({ params: { id: 'x' }, fetch: f } as never)).rejects.toMatchObject({ status: 404 });
	});

	it('edit patches numeric fields as numbers', async () => {
		const { calls, f } = recorder();
		await run('edit', { name: 'A', class: 'B', level: '3', evasion: '-1' }, f);
		const patch = calls.find((c) => c.method === 'PATCH')!;
		expect(patch).toMatchObject({ url: '/api/characters/c1' });
		expect(patch.body).toMatchObject({ name: 'A', level: 3, evasion: -1, maxHp: '' });
	});

	describe('edit thresholds on a level change', () => {
		const stored = { level: 1, majorThreshold: 8, severeThreshold: 16 };
		const patchOf = async (fields: Record<string, string>) => {
			const { calls, f } = recorder(200, stored);
			await run('edit', { name: 'A', class: 'Wizard', ...fields }, f);
			return calls.find((c) => c.method === 'PATCH')!.body as Record<string, unknown>;
		};
		it('drops untouched thresholds when the level changed', async () => {
			const b = await patchOf({ level: '3', majorThreshold: '8', severeThreshold: '16' });
			expect(b).not.toHaveProperty('majorThreshold');
			expect(b).not.toHaveProperty('severeThreshold');
		});
		it('keeps a threshold changed in the same submit', async () => {
			const b = await patchOf({ level: '3', majorThreshold: '9', severeThreshold: '16' });
			expect(b).toMatchObject({ majorThreshold: 9, severeThreshold: 16 });
		});
		it('keeps thresholds when the level is unchanged', async () => {
			const b = await patchOf({ level: '1', majorThreshold: '8', severeThreshold: '16' });
			expect(b).toMatchObject({ majorThreshold: 8, severeThreshold: 16 });
		});
	});

	it('edit leaves an unchanged legacy ancestry, community and subclass out of the PATCH', async () => {
		const calls: { method: string; body: unknown }[] = [];
		const f = (async (_u: string, init: RequestInit) => {
			calls.push({ method: init.method!, body: init.body ? JSON.parse(String(init.body)) : undefined });
			const body = init.method === 'GET' ? { ancestry: 'Homebrew', community: 'Wanderers of old' } : {};
			return new Response(JSON.stringify(body), { status: 200 });
		}) as unknown as typeof fetch;
		await run('edit', { name: 'A', class: 'Wizard', ancestry: 'Homebrew', community: 'Wanderers of old' }, f);
		const patch = calls.find((c) => c.method === 'PATCH')!;
		expect(patch.body).toMatchObject({ name: 'A' });
		expect(patch.body).not.toHaveProperty('ancestry');
		expect(patch.body).not.toHaveProperty('community');
	});

	it('edit still sends a changed non-SRD value so the API rejects it', async () => {
		const f = (async (_u: string, init: RequestInit) =>
			new Response(JSON.stringify(init.method === 'GET' ? { ancestry: 'Old' } : {}), { status: 200 })) as unknown as typeof fetch;
		const calls: unknown[] = [];
		const g = ((u: string, init: RequestInit) => {
			if (init.method === 'PATCH') calls.push(JSON.parse(String(init.body)));
			return f(u, init);
		}) as unknown as typeof fetch;
		await run('edit', { name: 'A', class: 'Wizard', ancestry: 'Other' }, g);
		expect(calls[0]).toMatchObject({ ancestry: 'Other' });
	});

	it('condition maps on/off to a boolean', async () => {
		const { calls, f } = recorder();
		await run('condition', { condition: 'hidden', value: 'on' }, f);
		expect(calls[0]).toMatchObject({ method: 'PUT', body: { hidden: true } });
		await run('condition', { condition: 'hidden', value: 'off' }, f);
		expect(calls[1].body).toEqual({ hidden: false });
	});

	it('condition rejects unknown names', async () => {
		const { calls, f } = recorder();
		const r = (await run('condition', { condition: 'x', value: 'on' }, f)) as { status: number };
		expect(r.status).toBe(400);
		expect(calls).toHaveLength(0);
	});

	it('gold surfaces API errors', async () => {
		const { f } = recorder(400, { error: 'not enough gold' });
		const r = (await run('gold', { handfuls: '-2' }, f)) as { status: number; data: { error: string } };
		expect(r.status).toBe(400);
		expect(r.data.error).toBe('error.invalid');
	});

	it('addItem omits an empty quantity', async () => {
		const { calls, f } = recorder();
		await run('addItem', { name: 'Rope', quantity: '' }, f);
		expect(calls[0].body).toEqual({ name: 'Rope' });
	});

	it('setQuantity and removeItem hit the item endpoint', async () => {
		const { calls, f } = recorder();
		await run('setQuantity', { itemId: 'i1', quantity: '5' }, f);
		await run('removeItem', { itemId: 'i1' }, f);
		expect(calls[0]).toMatchObject({ method: 'PATCH', url: '/api/items/i1', body: { quantity: 5 } });
		expect(calls[1]).toMatchObject({ method: 'DELETE', url: '/api/items/i1' });
	});
});
