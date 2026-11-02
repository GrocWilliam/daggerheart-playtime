<script lang="ts">
	import { translate, type Lang } from '$lib/i18n';
	let { lang }: { lang: Lang } = $props();

	async function choose(next: Lang) {
		const res = await fetch('/api/language', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ lang: next })
		});
		if (res.ok) location.reload();
	}
</script>

<div data-testid="language-switcher" role="group" aria-label={translate(lang, 'language.label')} class="lang-switcher">
	<button type="button" data-testid="lang-en" aria-pressed={lang === 'en'} onclick={() => choose('en')}>
		{translate(lang, 'language.en')}
	</button>
	<button type="button" data-testid="lang-fr" aria-pressed={lang === 'fr'} onclick={() => choose('fr')}>
		{translate(lang, 'language.fr')}
	</button>
</div>

<style>
	.lang-switcher {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem;
	}
	button {
		min-width: 2.75rem;
		min-height: 2.75rem;
	}
	button[aria-pressed='true'] {
		font-weight: bold;
	}
</style>
