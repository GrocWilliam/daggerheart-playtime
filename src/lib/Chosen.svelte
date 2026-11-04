<script lang="ts">
	import { translate } from '$lib/i18n';
	import Help from '$lib/Help.svelte';

	// Chosen SRD subclass / ancestry / community of a character, each with its helper.
	let {
		chosen,
		lang
	}: {
		chosen: Record<string, { id: string; name: string; en: string[] } | null>;
		lang: 'en' | 'fr';
	} = $props();
</script>

<ul class="mt-0 mb-3 list-none p-0!">
	{#each ['subclass', 'ancestry', 'community'] as k (k)}
		{#if chosen[k]}
			<li class="[overflow-wrap:anywhere]">
				<span class="muted">{translate(lang, `field.${k}`)}:</span>
				<span data-testid={k}>{chosen[k].name}</span>
				<Help id={chosen[k].id} name={chosen[k].name} {lang} en={chosen[k].en} />
			</li>
		{/if}
	{/each}
</ul>
