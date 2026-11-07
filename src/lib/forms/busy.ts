import type { SubmitFunction } from '@sveltejs/kit';

/**
 * `use:enhance` callback: the clicked button is busy and disabled until the action ends.
 * On success it also closes the form's enclosing `<dialog>`, if any.
 */
export const busy: SubmitFunction = ({ submitter, formElement }) => {
	const button = submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement ? submitter : null;
	button?.setAttribute('aria-busy', 'true');
	if (button) button.disabled = true;
	return async ({ update, result }) => {
		try {
			await update();
			if (result.type === 'success') formElement.closest('dialog')?.close();
		} finally {
			button?.removeAttribute('aria-busy');
			if (button) button.disabled = false;
		}
	};
};
