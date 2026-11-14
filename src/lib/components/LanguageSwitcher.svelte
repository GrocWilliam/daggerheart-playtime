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

<div data-testid="language-switcher" role="group" aria-label={translate(lang, 'language.label')} class="flex gap-2">
	<button
		class={[lang === 'en' ? 'btn-primary font-bold!' : 'btn-ghost font-normal!', 'min-h-11 min-w-11']}
		type="button"
		data-testid="lang-en"
		lang="en"
		aria-label={translate(lang, 'language.en')}
		aria-pressed={lang === 'en'}
		onclick={() => choose('en')}
	>
		{'en'.toUpperCase()}
	</button>
	<button
		class={[lang === 'fr' ? 'btn-primary font-bold!' : 'btn-ghost font-normal!', 'min-h-11 min-w-11']}
		type="button"
		data-testid="lang-fr"
		lang="fr"
		aria-label={translate(lang, 'language.fr')}
		aria-pressed={lang === 'fr'}
		onclick={() => choose('fr')}
	>
		{'fr'.toUpperCase()}
	</button>
</div>
