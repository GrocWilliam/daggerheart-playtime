import { describe, expect, it } from 'vitest';
import { actions, load } from './+page.server';
import type { LevelUpPlan } from '$lib/server/features/levelup';

const PLAN: LevelUpPlan = {
	fromLevel: 1,
	toLevel: 2,
	tier: 2,
	achievements: { experience: true, proficiency: true, clearTraits: false },
	options: [
		{ option: 'traits', slotsLeft: 3, slots: 1 },
		{ option: 'hp', slotsLeft: 2, slots: 1 }
	],
	unmarkedTraits: ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'],
	cards: [{ id: 'core_domain_card_bare_bones', name: 'Bare Bones', level: 1, domain: 'VALOR' }],
	subclassNext: null
};

/** A fake fetch: GET character, GET plan (status `planStatus`) and POST level-up (status `postStatus`). */
function fakeApi(planStatus = 200, post: { status: number; body: unknown } = { status: 200, body: {} }) {
	const posts: unknown[] = [];
	const f = (async (url: string, init: RequestInit) => {
		const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
		if (init.method === 'POST') {
			posts.push(JSON.parse(String(init.body)));
			return reply(post.status, post.body);
		}
		if (url.endsWith('/level-up')) return reply(planStatus, planStatus === 200 ? PLAN : { error: 'no' });
		return reply(200, { id: 'c1', name: 'Rook', class: 'Guardian', level: 1, experiences: [], cards: [] });
	}) as unknown as typeof fetch;
	return { f, posts };
}

const loadAt = (query: string, f: typeof fetch) =>
	load({ params: { id: 'c1' }, fetch: f, url: new URL(`http://x/characters/c1/level-up?${query}`), locals: { lang: 'en' } } as never);

const submit = (fields: Record<string, string>, f: typeof fetch) =>
	(actions.default as never as (e: unknown) => Promise<unknown>)({
		request: new Request('http://x', { method: 'POST', body: new URLSearchParams(fields) }),
		params: { id: 'c1' },
		fetch: f
	});

const VALID = { newExperience: 'Brawler', pick1: 'traits', pick2: 'hp', p1trait1: 'agility', p1trait2: 'strength', domainCard: 'core_domain_card_bare_bones' };

describe('level-up page server', () => {
	it('redirects to the sheet when the plan is refused', async () => {
		await expect(loadAt('step=1', fakeApi(400).f)).rejects.toMatchObject({ status: 303, location: '/characters/c1' });
	});

	it('redirects to the first invalid earlier step', async () => {
		await expect(loadAt('step=3&newExperience=Brawler', fakeApi().f)).rejects.toMatchObject({
			status: 303,
			location: '/characters/c1/level-up?step=2&newExperience=Brawler&invalid=pick1'
		});
	});

	it('loads a step with its card options in the page language', async () => {
		const d = (await loadAt('step=4&newExperience=Brawler&pick1=traits&pick2=hp&p1trait1=agility&p1trait2=strength', fakeApi().f)) as {
			step: number;
			cardGroups: { cards: { id: string }[] }[];
			invalid: string | null;
		};
		expect(d.step).toBe(4);
		expect(d.cardGroups.flatMap((g) => g.cards.map((c) => c.id))).toEqual(['core_domain_card_bare_bones']);
		expect(d.invalid).toBeNull();
	});

	it('posts the body and redirects to the sheet', async () => {
		const { f, posts } = fakeApi();
		await expect(submit(VALID, f)).rejects.toMatchObject({ status: 303, location: '/characters/c1' });
		expect(posts[0]).toMatchObject({ newExperience: 'Brawler', domainCard: 'core_domain_card_bare_bones' });
	});

	it('maps an API 400 back to its step', async () => {
		const { f } = fakeApi(200, { status: 400, body: { error: 'traits must be two different unmarked traits' } });
		await expect(submit(VALID, f)).rejects.toMatchObject({ status: 303, location: expect.stringContaining('step=3') });
		await expect(submit(VALID, f)).rejects.toMatchObject({ location: expect.stringContaining('invalid=p1trait1') });
	});
});
