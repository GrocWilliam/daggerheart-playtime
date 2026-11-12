// Setup through the JSON API (no clicking through pages).
const call = async (base, method, path, body) => {
	const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
	if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${await r.text()}`);
	return r.json().catch(() => null);
};

export const createCampaign = async (base, name) => (await call(base, 'POST', '/api/campaigns', { name })).id;

export const createCharacter = async (base, campaignId, name, extra = {}) =>
	(await call(base, 'POST', `/api/campaigns/${campaignId}/characters`, { name, class: 'Guardian', evasion: 10, majorThreshold: 5, severeThreshold: 10, maxHp: 6, armorSlots: 3, ...extra })).id;

export const createCurrentScene = async (base, campaignId, title) => {
	const s = await call(base, 'POST', `/api/campaigns/${campaignId}/scenes`, { title });
	await call(base, 'PATCH', `/api/campaigns/${campaignId}/scenes/${s.id}`, { status: 'current' });
	return s.id;
};

export const addJournalEntry = (base, campaignId, text) => call(base, 'POST', `/api/campaigns/${campaignId}/journal`, { text });
