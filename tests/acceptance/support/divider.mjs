// The Divider under each page h1: setup of the seven pages and reads of its geometry. No expected values here.
import { createCampaign, createCharacter } from './api.mjs';
import { tunnelUrl, levelUpUrl } from './tunnels.mjs';

export const VIEWPORTS = [[375, 812], [1280, 900]];

export const dividerPages = async (base) => {
	const cid = await createCampaign(base, 'Dividercamp');
	const chid = await createCharacter(base, cid, 'Rook', {
		level: 1, evasion: 9, maxHp: 7,
		traits: { agility: 1, strength: 2, finesse: 0, instinct: 1, presence: 0, knowledge: -1 }
	});
	return [
		{ name: 'home', url: `${base}/` },
		{ name: 'build', url: `${base}/campaigns/${cid}?step=build` },
		{ name: 'run', url: `${base}/campaigns/${cid}` },
		{ name: 'sheet', url: `${base}/characters/${chid}` },
		{ name: 'tunnel', url: tunnelUrl(base, cid, 1) },
		{ name: 'level-up', url: levelUpUrl(base, chid, 1) },
		{ name: 'reference', url: `${base}/reference` }
	];
};

export const dividerGeometry = (page) => page.evaluate(() => {
	const h1 = document.querySelector('h1');
	const div = document.querySelector('[data-testid="divider"]');
	const svg = div?.querySelector('svg');
	if (!h1 || !svg) return null;
	const a = h1.getBoundingClientRect();
	const s = svg.getBoundingClientRect();
	const first = svg.querySelector('line, path, circle, rect, polygon');
	const f = first?.getBoundingClientRect();
	return {
		h1Left: a.left, svgLeft: s.left, width: s.width, height: s.height,
		par: svg.getAttribute('preserveAspectRatio'),
		firstLeft: f ? f.left : null
	};
});

export const sideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
