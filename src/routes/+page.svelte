<script lang="ts">
	import { translate } from '$lib/i18n';
	let { data, form } = $props();
	const t = (key: string) => translate(data.lang, key);
</script>

<svelte:head><title>{t('home.title')}</title></svelte:head>

<h1>{t('home.title')}</h1>

<h2>{t('home.campaigns')}</h2>

<ul class="list mb-3 mt-0 list-none pl-0!">
	{#each data.campaigns as c (c.id)}
		<li class="mb-3 rounded-lg border-l-[3px] border-solid border-accent bg-surface last:mb-0"><a class="flex! min-h-11 w-full px-3 py-0" data-testid="campaign-link" href="/campaigns/{c.id}">{c.name}</a></li>
	{/each}
</ul>

<form method="POST">
	<label>{t('home.name')} <input type="text" name="name" value={form?.name ?? ''} /></label>
	<button type="submit">{t('home.create')}</button>
	{#if form?.error}<p role="alert">{t('home.error')}</p>{/if}
</form>
