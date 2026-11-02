import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL;
const getHome = async () => {
	const res = await fetch(BASE + '/');
	return { res, html: await res.text() };
};
const links = (html) =>
	[...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)]
		.map((m) => m[0])
		.filter((a) => /data-testid=["']campaign-link["']/.test(a))
		.map((a) => ({
			href: /href=["']([^"']*)["']/.exec(a)?.[1],
			text: a.replace(/<[^>]*>/g, '').trim()
		}));
const apiList = async () => (await fetch(BASE + '/api/campaigns')).json();
const attr = (tag, name) => new RegExp(`\\b${name}=["']([^"']*)["']`).exec(tag)?.[1];

// Fills in the page's own HTML form (no JS) and POSTs it like a browser would.
async function submitForm(html, name) {
	const form = /<form\b[^>]*>[\s\S]*?<\/form>/i.exec(html)?.[0];
	assert.ok(form, 'page has a <form>');
	const open = /<form\b[^>]*>/i.exec(form)[0];
	assert.match(attr(open, 'method') ?? '', /post/i);
	const action = attr(open, 'action') || '/';
	const inputs = [...form.matchAll(/<input\b[^>]*>/gi)].map((m) => m[0]);
	const text = inputs.find((i) => (attr(i, 'type') ?? 'text') === 'text');
	assert.ok(text && attr(text, 'name'), 'form has a named text input');
	assert.ok(
		inputs.some((i) => attr(i, 'type') === 'submit') || /<button\b/i.test(form),
		'form has a submit button'
	);
	const body = new URLSearchParams();
	for (const i of inputs) {
		const t = attr(i, 'type') ?? 'text';
		if (i !== text && attr(i, 'name') && ['hidden'].includes(t)) body.set(attr(i, 'name'), attr(i, 'value') ?? '');
	}
	body.set(attr(text, 'name'), name);
	const url = new URL(action.replace(/&amp;/g, '&'), BASE + '/');
	return fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded', origin: new URL(BASE).origin },
		body: body.toString()
	});
}

test('with no campaigns, GET / returns 200 HTML with the create form and no campaign-link', async () => {
	assert.deepEqual(await apiList(), []);
	const { res, html } = await getHome();
	assert.equal(res.status, 200);
	assert.match(res.headers.get('content-type') ?? '', /html/);
	assert.match(html, /<form\b/i);
	assert.match(html, /<input\b/i);
	assert.doesNotMatch(html, /data-testid=["']campaign-link["']/);
});

let first;
test('after creating "Fog of Fate" via the API, GET / has exactly one matching campaign-link', async () => {
	const r = await fetch(BASE + '/api/campaigns', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name: 'Fog of Fate' })
	});
	assert.equal(r.status, 201);
	first = await r.json();
	const { res, html } = await getHome();
	assert.equal(res.status, 200);
	const l = links(html);
	assert.equal(l.length, 1);
	assert.equal(l[0].href, `/campaigns/${first.id}`);
	assert.ok(l[0].text.includes('Fog of Fate'), l[0].text);
});

test('submitting the form with "Second Camp" lists both campaigns, oldest first', async () => {
	const { html } = await getHome();
	const res = await submitForm(html, 'Second Camp');
	assert.ok(res.status < 400, `status ${res.status}`);
	const list = await apiList();
	assert.equal(list.length, 2);
	assert.equal(list[1].name, 'Second Camp');
	const { html: after } = await getHome();
	const l = links(after);
	assert.deepEqual(
		l.map((x) => x.href),
		list.map((c) => `/campaigns/${c.id}`)
	);
	assert.ok(l[0].text.includes('Fog of Fate'));
	assert.ok(l[1].text.includes('Second Camp'));
});

test('submitting the form with an empty name creates nothing', async () => {
	const before = await apiList();
	const beforeLinks = links((await getHome()).html);
	const { html } = await getHome();
	const res = await submitForm(html, '');
	assert.ok(res.status < 500, `status ${res.status}`);
	assert.deepEqual(await apiList(), before);
	const { res: r2, html: after } = await getHome();
	assert.equal(r2.status, 200);
	assert.deepEqual(links(after), beforeLinks);
	assert.match(after, /<form\b/i);
});
