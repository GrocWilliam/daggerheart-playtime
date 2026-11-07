import { beforeAll, describe, expect, it } from 'vitest';
import { busy } from './busy';

class FakeButton {
	disabled = false;
	attrs = new Map<string, string>();
	setAttribute(k: string, v: string) { this.attrs.set(k, v); }
	removeAttribute(k: string) { this.attrs.delete(k); }
}

beforeAll(() => {
	const g = globalThis as Record<string, unknown>;
	g.HTMLButtonElement ??= FakeButton;
	g.HTMLInputElement ??= class {};
});

async function submit(type: 'success' | 'failure' | 'redirect', inDialog = true) {
	const dialog = { closed: 0, close() { this.closed++; } };
	const formElement = { closest: (sel: string) => (inDialog && sel === 'dialog' ? dialog : null) };
	const button = new (globalThis as unknown as { HTMLButtonElement: typeof FakeButton }).HTMLButtonElement();
	const after = (busy as unknown as (i: unknown) => (o: unknown) => Promise<void>)({ submitter: button, formElement });
	let busyDuringUpdate: string | undefined;
	await after({
		update: async () => { busyDuringUpdate = button.attrs.get('aria-busy'); },
		result: { type, status: type === 'failure' ? 400 : 200, data: {} }
	});
	return { dialog, button, busyDuringUpdate };
}

describe('busy', () => {
	it('marks the submitter busy until the update ends', async () => {
		const { button, busyDuringUpdate } = await submit('failure');
		expect(busyDuringUpdate).toBe('true');
		expect(button.attrs.has('aria-busy')).toBe(false);
		expect(button.disabled).toBe(false);
	});
	it('closes the enclosing dialog on success', async () => {
		expect((await submit('success')).dialog.closed).toBe(1);
	});
	it('keeps the dialog open on failure and redirect', async () => {
		expect((await submit('failure')).dialog.closed).toBe(0);
		expect((await submit('redirect')).dialog.closed).toBe(0);
	});
	it('does nothing more outside a dialog', async () => {
		await expect(submit('success', false)).resolves.toBeTruthy();
	});
});
