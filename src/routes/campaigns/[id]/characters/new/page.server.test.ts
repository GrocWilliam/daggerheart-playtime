import { describe, expect, it } from 'vitest';
import { load, actions } from './+page.server';

type Call = { url: string; init?: RequestInit };
const fake = (status: number, body: unknown, calls: Call[] = []) =>
	(async (url: string, init?: RequestInit) => {
		calls.push({ url, init });
		return new Response(JSON.stringify(body), { status });
	}) as unknown as typeof fetch;
const url = (q: string) => new URL(`http://x/campaigns/c1/characters/new${q}`);
const ok = fake(200, { id: 'c1', name: 'Camp', fear: 0, characters: [] });
const valid = { name: 'Mira', class: 'Bard', level: '2', evasion: '10', majorThreshold: '5', severeThreshold: '10', maxHp: '6', maxStress: '6', armorSlots: '3' };
const run = (q: string, fetch = ok) => load({ params: { id: 'c1' }, fetch, url: url(q), locals: { lang: 'en' } } as never) as Promise<Record<string, unknown>>;
const post = (fields: Record<string, string>, fetch: typeof globalThis.fetch) => {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.set(k, v);
	return actions.default({ params: { id: 'c1' }, fetch, request: new Request('http://x', { method: 'POST', body: fd }) } as never);
};

describe('tunnel page server', () => {
	it('load: unknown or bad campaign is a 404', async () => {
		await expect(run('', fake(404, { error: 'nf' }))).rejects.toMatchObject({ status: 404 });
		await expect(run('', fake(400, { error: 'bad' }))).rejects.toMatchObject({ status: 404 });
	});
	it('load: step 1 by default and for junk steps', async () => {
		for (const q of ['', '?step=9', '?step=x']) expect((await run(q)).step).toBe(1);
		const r = await run('?name=Mira&invalid=level');
		expect(r.campaign).toEqual({ id: 'c1', name: 'Camp' });
		expect(r.values).toEqual({ name: 'Mira' });
		expect(r.invalid).toBe('level');
		expect((r.picks as Record<string, unknown[]>).class).toHaveLength(9);
		expect((await run('?invalid=nope')).invalid).toBeNull();
	});
	it('load: invalid earlier steps redirect with 303', async () => {
		await expect(run('?step=3&name=Mira&class=Bard&level=11')).rejects.toMatchObject({ status: 303, location: expect.stringContaining('step=1') });
		await expect(run('?step=3&name=Mira&class=Bard&level=11')).rejects.toMatchObject({ location: expect.stringContaining('invalid=level') });
		const q = new URLSearchParams({ step: '4', ...valid, majorThreshold: '10', severeThreshold: '5' });
		await expect(run(`?${q}`)).rejects.toMatchObject({ status: 303, location: expect.stringMatching(/step=3.*invalid=severeThreshold/) });
		expect((await run(`?${new URLSearchParams({ step: '4', ...valid })}`)).step).toBe(4);
	});
	it('action: 201 redirects to the sheet with the API body', async () => {
		const calls: Call[] = [];
		await expect(post({ ...valid, ancestry: 'Clank', community: '' }, fake(201, { id: 'n1' }, calls))).rejects.toMatchObject({ status: 303, location: '/characters/n1' });
		expect(calls[0].url).toBe('/api/campaigns/c1/characters');
		const body = JSON.parse(String(calls[0].init?.body));
		expect(body).toMatchObject({ name: 'Mira', level: 2, maxHp: 6 });
		expect(body.ancestry).toBeTruthy();
		expect('community' in body).toBe(false);
	});
	it('action: 400 redirects to the step of the field, or review', async () => {
		await expect(post({ ...valid, maxHp: '99' }, fake(400, { error: 'maxHp must be an integer from 1 to 12' }))).rejects.toMatchObject({
			status: 303,
			location: expect.stringMatching(/step=3.*name=Mira.*invalid=maxHp/)
		});
		await expect(post(valid, fake(400, { error: 'body must be a JSON object' }))).rejects.toMatchObject({ location: expect.stringMatching(/step=4.*invalid=review/) });
	});
	it('action: other statuses fail with a catalog key', async () => {
		expect(await post(valid, fake(404, { error: 'campaign not found' }))).toMatchObject({ status: 404, data: { error: 'error.notFound' } });
		expect(await post(valid, fake(500, { error: 'x' }))).toMatchObject({ status: 500, data: { error: 'error.server' } });
	});
});
