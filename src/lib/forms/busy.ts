import type { SubmitFunction } from '@sveltejs/kit';

/** `use:enhance` callback: the clicked button is busy and disabled until the action ends. */
export const busy: SubmitFunction = ({ submitter }) => {
	const button = submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement ? submitter : null;
	button?.setAttribute('aria-busy', 'true');
	if (button) button.disabled = true;
	return async ({ update }) => {
		try {
			await update();
		} finally {
			button?.removeAttribute('aria-busy');
			if (button) button.disabled = false;
		}
	};
};
