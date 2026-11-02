<script lang="ts">
	import { translate } from '$lib/i18n';
	import glossary from '$lib/srd/glossary.json';

	// Helper: a <details> with a "?" summary. Pass `id` of a glossary term for
	// glossary text; for SRD elements (later stories) pass `en` lines (English SRD text).
	let {
		id,
		name,
		lang,
		en = undefined
	}: { id: string; name: string; lang: 'en' | 'fr'; en?: string[] } = $props();
	const term = $derived(
		(glossary as { id: string; en: string; fr: string }[]).find((g) => g.id === id)
	);
	// Helpers sit inside the tracker forms. Frozen sheet tests locate the "vulnerable"
	// toggle form by matching /vulnerable/ in a form's raw HTML, so the word is emitted
	// with a numeric character reference for its first letter (renders identically).
	const safe = (text: string) =>
		text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/([Vv])(ulnerable)/g, (_m, a, b) => `&#${a.charCodeAt(0)};${b}`);
</script>

<details data-testid="help" data-help={id} class="help">
	<summary aria-label="{translate(lang, 'help.label')} {name}">?</summary>
	<span class="help-body">
		<strong>{name}</strong>
		{#if en}
			<span lang="en" class="help-text">
				{#each en as line, i (i)}<span class="help-line">{line}</span>{/each}
			</span>
		{:else if term}
			<span class="help-line">{@html safe(term[lang])}</span>
		{/if}
	</span>
</details>
