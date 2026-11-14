// US-345: scan every visible button of the app's pages (setup over HTTP, reads only: no expectations).
import { createCampaign, createCharacter } from './api.mjs';
import { setupRunCampaign } from './runstep.mjs';
import { levelThreeCharacter, SHEET_TABS } from './sheet.mjs';
import { levelOneCharacter, tunnelUrl, levelUpUrl } from './tunnels.mjs';
import { buildStepUrl } from './scenes.mjs';
import { runStepUrl, homeUrl, sheetUrl } from './pages.mjs';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export const VARIANTS = ['btn-primary', 'btn-secondary', 'btn-ghost', 'btn-danger'];
export const VARIANT_LOOKS = [
	['rgb(212, 160, 80)', 'rgb(15, 26, 21)'],
	['rgba(0, 0, 0, 0)', 'rgb(212, 160, 80)'],
	['rgba(0, 0, 0, 0)', 'rgb(239, 228, 200)'],
	['rgba(0, 0, 0, 0)', 'rgb(238, 128, 112)']
];

/** Campaign with a current scene, encounter, loot and a journal entry; a level-3 sheet with item/experience/card; a level-1 character; returns the list of { name, url }. */
export const setupButtonPages = async (base) => {
	const run = await setupRunCampaign(base, 'btn345');
	const r = await fetch(`${base}/api/campaigns/${run.campaignId}/scenes/${run.sceneId}/loot`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ table: 'items', rarity: 'common', count: 2, seed: 3 }) });
	if (!r.ok) throw new Error(`loot -> ${r.status}`);
	const sheet = await levelThreeCharacter(base, 'Btnsheet');
	const lvl1 = await levelOneCharacter(base);
	const tunnelCamp = await createCampaign(base, 'Btntunnel');
	return [
		{ name: 'home', url: homeUrl(base) },
		{ name: 'reference', url: `${base}/reference` },
		{ name: 'build', url: buildStepUrl(base, run.campaignId) },
		{ name: 'run', url: runStepUrl(base, run.campaignId) },
		...SHEET_TABS.map((t) => ({ name: `sheet-${t}`, url: sheetUrl(base, sheet, t) })),
		{ name: 'tunnel-1', url: tunnelUrl(base, tunnelCamp, 1) },
		{ name: 'level-up-1', url: levelUpUrl(base, lvl1, 1) }
	];
};

/** Every visible <button> of the page (closed <details> are opened first): classes, computed looks, size, form action and testid. */
export const scanButtons = async (page) => {
	await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
	return page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.checkVisibility() && b.getClientRects().length > 0).map((b, i) => {
		const r = b.getBoundingClientRect();
		const c = getComputedStyle(b);
		const f = b.closest('form');
		return {
			label: `${b.dataset.testid || b.textContent.trim().slice(0, 30) || '#' + i}`,
			classes: [...b.classList].filter((k) => k.startsWith('btn-')),
			look: [c.backgroundColor, c.color],
			width: r.width, height: r.height,
			action: b.getAttribute('formaction') ?? f?.getAttribute('action') ?? null,
			formIndex: f ? [...document.querySelectorAll('form')].indexOf(f) : null
		};
	}));
};

/** Visible buttons of each form that are btn-primary: { formIndex: [labels] }. */
export const primariesByForm = (buttons) => {
	const out = {};
	for (const b of buttons) if (b.formIndex !== null && b.classes.includes('btn-primary')) (out[b.formIndex] ??= []).push(b.label);
	return out;
};

export const sidewaysScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Run the project's Vitest for src/buttons.test.ts; with `svelte` a temporary file is put under src for the run and removed after. */
export const runButtonsUnitTest = (root, svelte) => {
	const tmp = svelte ? join(root, 'src/lib/components', svelte.name) : null;
	try {
		if (tmp) writeFileSync(tmp, svelte.content);
		const r = spawnSync('npx', ['vitest', 'run', 'src/buttons.test.ts'], { cwd: root, encoding: 'utf8', timeout: 280000, env: { ...process.env, CI: '1', NO_COLOR: '1', FORCE_COLOR: '0' } });
		return { status: r.status, output: `${r.stdout}\n${r.stderr}` };
	} finally {
		if (tmp) rmSync(tmp, { force: true });
	}
};
export const claudeMd = (root) => readFileSync(join(root, 'CLAUDE.md'), 'utf8');
