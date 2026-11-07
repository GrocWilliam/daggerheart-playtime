import { existsSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { busy } from '../../../src/lib/forms/busy';

// Minimal DOM stand-ins: busy() only touches the submitter and the form's enclosing dialog.
class FakeButton {
	disabled = false;
	attrs = new Map<string, string>();
	setAttribute(k: string, v: string) { this.attrs.set(k, v); }
	removeAttribute(k: string) { this.attrs.delete(k); }
	getAttribute(k: string) { return this.attrs.get(k) ?? null; }
	hasAttribute(k: string) { return this.attrs.has(k); }
}
beforeAll(() => {
	const g = globalThis as Record<string, unknown>;
	g.HTMLButtonElement ??= FakeButton;
	g.HTMLInputElement ??= class {};
	g.HTMLElement ??= class {};
	g.HTMLFormElement ??= class {};
	g.HTMLDialogElement ??= class {};
});

async function run(type: 'success' | 'failure', withDialog = true) {
	const dialog = { closed: 0, open: true, close() { this.closed++; this.open = false; } };
	const formElement = { closest: (sel: string) => (withDialog && /dialog/i.test(sel) ? dialog : null) };
	const submitter = new (globalThis as unknown as { HTMLButtonElement: typeof FakeButton }).HTMLButtonElement();
	let updated = 0;
	const after = (busy as unknown as (i: unknown) => unknown)({
		submitter, formElement, form: formElement, formData: new FormData(), action: new URL('http://x/'),
		controller: new AbortController(), cancel() {}
	}) as (i: unknown) => Promise<void>;
	const result = type === 'success' ? { type, status: 200, data: {} } : { type, status: 400, data: { error: 'home.error' } };
	await after({ update: async () => { updated++; }, result, formElement, form: formElement, formData: new FormData(), action: new URL('http://x/') });
	return { dialog, updated };
}

describe('busy closes an enclosing dialog on success (US-193)', () => {
	it('a success result calls close() on the enclosing dialog', async () => {
		const { dialog, updated } = await run('success');
		expect(updated).toBe(1);
		expect(dialog.closed).toBe(1);
	});
	it('a failure result does not close the dialog', async () => {
		const { dialog, updated } = await run('failure');
		expect(updated).toBe(1);
		expect(dialog.closed).toBe(0);
	});
	it('a success result outside any dialog does not throw', async () => {
		await expect(run('success', false)).resolves.toBeTruthy();
	});
	it('the project has its own unit test for busy at src/lib/forms/busy.test.ts', () => {
		expect(existsSync('src/lib/forms/busy.test.ts')).toBe(true);
	});
});
