// DM screen class-name reads over HTTP (no browser).
import { createCampaign, createCharacter } from './api.mjs';

export const setupCampaignWith = async (base, className, charName) => {
	const campaignId = await createCampaign(base, 'Camp ' + charName);
	const characterId = await createCharacter(base, campaignId, charName, { class: className, level: 2 });
	return { campaignId, characterId };
};

const fetchHtml = async (base, path, lang) => {
	const r = await fetch(base + path, { headers: lang ? { cookie: `lang=${lang}` } : {} });
	if (r.status !== 200) throw new Error(`${path} -> ${r.status}`);
	return r.text();
};

const slice = (html, marker, name, enders) => {
	const starts = [...html.matchAll(new RegExp(`data-testid="${marker}"`, 'g'))].map((m) => m.index);
	for (const s of starts) {
		const rest = html.slice(s);
		let end = rest.indexOf('<script') > 0 ? rest.indexOf('<script') : rest.length;
		for (const e of enders) { const i = rest.indexOf(e, 10); if (i > 0 && i < end) end = i; }
		const chunk = rest.slice(0, end);
		if (chunk.includes(name)) return chunk;
	}
	throw new Error(`no ${marker} for ${name}`);
};

export const runPage = (base, id, lang) => fetchHtml(base, `/campaigns/${id}`, lang);
export const buildPage = (base, id, lang) => fetchHtml(base, `/campaigns/${id}?step=build`, lang);

export const cardOf = (html, name) => slice(html, 'character-card', name, ['data-testid="character-card"']);
export const partyEntryOf = (html, name) => slice(html, 'party-member', name, ['data-testid="party-member"', 'data-testid="build-scenes"']);

export const textOf = (chunk) => chunk.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
export const elementsHolding = (chunk, word) =>
	[...chunk.matchAll(/<([a-z0-9]+)([^>]*)>\s*([^<]*)</gi)].filter((m) => m[3].trim() === word).map((m) => m[2]);

export const apiClass = async (base, characterId) => (await (await fetch(`${base}/api/characters/${characterId}`)).json()).class;
