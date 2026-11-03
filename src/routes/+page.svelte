<script lang="ts">
	import { translate } from '$lib/i18n';
	let { data, form } = $props();
	const t = (key: string) => translate(data.lang, key);
</script>

<h1>{t('home.title')}</h1>

<h2>{t('home.campaigns')}</h2>

<ul class="list">
	{#each data.campaigns as c (c.id)}
		<li><a data-testid="campaign-link" href="/campaigns/{c.id}">{c.name}</a></li>
	{/each}
</ul>

<form method="POST">
	<label>{t('home.name')} <input type="text" name="name" value={form?.name ?? ''} /></label>
	<button type="submit">{t('home.create')}</button>
	{#if form?.error}<p role="alert">{t('home.error')}</p>{/if}
</form>
