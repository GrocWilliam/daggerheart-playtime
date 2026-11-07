<script lang="ts">
	import { translate, type Lang } from '$lib/i18n';
	import Help from '$lib/components/Help.svelte';

	// Chosen SRD subclass / ancestry / community of a character, each with its helper.
	let {
		chosen,
		lang
	}: {
		chosen: Record<string, { id: string; name: string; nameLang: Lang; lines: { text: string; lang: Lang }[] } | null>;
		lang: Lang;
	} = $props();
</script>

<ul class="mt-0 mb-3 list-none p-0!">
	{#each ['subclass', 'ancestry', 'community'] as k (k)}
		{#if chosen[k]}
			<li class="[overflow-wrap:anywhere]">
				<span class="muted">{translate(lang, `field.${k}`)}:</span>
				<span data-testid={k} lang={chosen[k].nameLang}>{chosen[k].name}</span>
				<Help id={chosen[k].id} name={chosen[k].name} nameLang={chosen[k].nameLang} {lang} lines={chosen[k].lines} />
			</li>
		{/if}
	{/each}
</ul>
