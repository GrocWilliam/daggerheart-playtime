import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launchBrowser, openPage, closePage } from '../support/browser.mjs';
import { runStepUrl } from '../support/pages.mjs';
import { setupRunCampaign, buildStepUrl, pageFrame, bodyWidth, cardTops, box, sidewaysScroll } from '../support/runstep.mjs';

const BASE = process.env.BASE_URL;
let browser, camp;
before(async () => { browser = await launchBrowser(); camp = await setupRunCampaign(BASE); });
after(async () => { await browser?.close(); });
const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1, `${msg}: ${a} vs ${b}`);
const onStep = async (step, vp) => openPage(browser, (step === 'run' ? runStepUrl : buildStepUrl)(BASE, camp.campaignId), vp);

for (const vp of [[1024, 768], [1280, 900], [1440, 900]])
	test(`header and h1 have the same left edge and width on Build and Run at ${vp.join('x')}`, async () => {
		const b = await onStep('build', vp); const fb = await pageFrame(b); await closePage(b);
		const r = await onStep('run', vp); const fr = await pageFrame(r); await closePage(r);
		for (const k of ['header', 'h1']) {
			near(fb[k].left, fr[k].left, `${k} left`);
			near(fb[k].width, fr[k].width, `${k} width`);
		}
	});

test('the body is 1152px wide on both steps at 1440x900', async () => {
	for (const step of ['build', 'run']) {
		const p = await onStep(step, [1440, 900]);
		near(await bodyWidth(p), 1152, `body on ${step}`);
		await closePage(p);
	}
});

for (const vp of [[1280, 900], [1440, 900]])
	test(`the Run content is 1232px wide and centred on the h1 at ${vp.join('x')}`, async () => {
		const p = await onStep('run', vp);
		const f = await pageFrame(p);
		near(f.run.width, 1232, 'run width');
		near(f.h1.left - f.run.left, f.run.right - f.h1.right, 'overhang left vs right');
		await closePage(p);
	});

test('below 1280px the Run content is as wide as the h1 at 1024x768', async () => {
	const p = await onStep('run', [1024, 768]);
	const f = await pageFrame(p);
	near(f.run.width, f.h1.width, 'run vs h1 width');
	near(f.run.left, f.h1.left, 'run vs h1 left');
	await closePage(p);
});

test('3 cards share the first row and the aside is 288px wide at 1280x800', async () => {
	const p = await onStep('run', [1280, 800]);
	const tops = await cardTops(p);
	assert.equal(tops.length, 3);
	assert.equal(tops.filter((t) => Math.abs(t - tops[0]) <= 2).length, 3);
	const a = await box(p, 'current-scene');
	near(a.width, 288, 'aside width');
	await closePage(p);
});

for (const vp of [[375, 812], [1280, 900], [1440, 900]])
	test(`no sideways scroll on the Run step at ${vp.join('x')}`, async () => {
		const p = await onStep('run', vp);
		assert.ok((await sidewaysScroll(p)) <= 0);
		await closePage(p);
	});

test('Build step at 1440x900: header, h1, build-party and build-scenes sit in the centred 1152px body', async () => {
	const p = await onStep('build', [1440, 900]);
	const f = await pageFrame(p);
	near(await bodyWidth(p), 1152, 'body width');
	near(f.h1.left, f.header.left, 'h1 left vs header');
	near(f.party.left, f.header.left, 'build-party left vs header');
	near(f.scenes.right, f.header.right, 'build-scenes right vs header');
	near(f.header.left + f.header.right, 1440, 'header centred');
	assert.ok(f.party.right <= f.scenes.left + 1, 'party left of scenes');
	await closePage(p);
});

test('src/app.css no longer contains body:has([data-testid=run])', () => {
	const css = readFileSync(new URL('../../../src/app.css', import.meta.url), 'utf8');
	assert.ok(!css.includes('body:has([data-testid=run])'));
});
