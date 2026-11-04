import { describe, expect, it } from 'vitest';
import { load, actions } from './+page.server';

const reply = (status: number, body: unknown) =>
	(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

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
