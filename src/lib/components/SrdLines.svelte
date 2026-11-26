<script lang="ts">
	import type { Lang } from '$lib/i18n';

	// SRD text lines (`helpLines` in srd.ts): each in its own language, an optional `label` in the page language `lang`.
	// Inline-level markup only (block-displayed spans): Help's panel sits inside paragraphs and forms.
	let { lines, lang }: { lines: { text: string; lang: Lang; label?: string }[]; lang: Lang } = $props();
</script>

{#each lines as line, i (i)}
	{#if line.label}
		<span class="my-1 block"><span {lang}>{line.label}:</span> <span lang={line.lang}>{line.text}</span></span>
	{:else}
		<span lang={line.lang} class="my-1 block">{line.text}</span>
	{/if}
{/each}
