<script lang="ts">
	import { translate, type Lang } from '$lib/i18n';
	import glossary from '$lib/srd/glossary.json';

	// Helper: a <details> with a "?" summary. Pass `id` of a glossary term for glossary text, `text` for a catalog
	// string, or SRD `lines` (each in its own language, an optional `label` in the page language). `nameLang` is the
	// language of an SRD `name`.
	let {
		id,
		name,
		lang,
		nameLang = undefined,
		lines = undefined,
		text = undefined
	}: {
		id: string;
		name: string;
		lang: Lang;
		nameLang?: Lang;
		lines?: { text: string; lang: Lang; label?: string }[];
		text?: string;
	} = $props();
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

<details data-testid="help" data-help={id} class="inline-block align-middle open:min-w-0 open:shrink">
	<summary class="inline-flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center font-bold" aria-label="{translate(lang, 'help.label')} {name}">?</summary>
	<span class="block border-l-3 border-muted px-2 py-1">
		<strong lang={nameLang}>{name}</strong>
		{#if lines}
			{#each lines as line, i (i)}
				{#if line.label}
					<span class="my-1 block"><span {lang}>{line.label}:</span> <span lang={line.lang}>{line.text}</span></span>
				{:else}
					<span lang={line.lang} class="my-1 block">{line.text}</span>
				{/if}
			{/each}
		{:else if text}
			<span class="my-1 block">{text}</span>
		{:else if term}
			<span class="my-1 block">{@html safe(term[lang])}</span>
		{/if}
	</span>
</details>
