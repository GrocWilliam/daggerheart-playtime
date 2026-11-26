<script lang="ts">
	import { enhance } from '$app/forms';
	import { busy } from '$lib/forms/busy';
	import Divider from '$lib/components/Divider.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { translate } from '$lib/i18n';
	let { data, form } = $props();
	const t = (key: string) => translate(data.lang, key);
</script>

<svelte:head><title>{t('home.title')}</title></svelte:head>

<h1>{t('home.title')}</h1>
<Divider />

<h2>{t('home.campaigns')}</h2>

<ul class="list mb-3 mt-0 grid list-none grid-cols-[minmax(0,1fr)] gap-3 pl-0! md:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[repeat(3,minmax(0,1fr))]">
	{#each data.campaigns as c (c.id)}
		<li class="rounded-lg border-y-0 border-l-[3px] border-solid border-accent bg-surface"><a class="flex min-h-11 w-full min-w-0 flex-col justify-center px-3 py-0" data-testid="campaign-link" href="/campaigns/{c.id}"><span class="pt-2 font-display text-xl" data-testid="campaign-name">{c.name}</span><p class="m-0 pb-2 text-base text-muted" data-testid="campaign-meta">{[translate(data.lang, 'home.meta.characters', { count: c.characters }), c.scene ?? t('home.meta.noScene'), c.lastJournal].filter(Boolean).join(' · ')}</p></a></li>
	{/each}
</ul>

<Modal kind="campaign" openerClass="btn-primary" title={t('home.new')} lang={data.lang}>
{#snippet children(cancel)}
	<form use:enhance={busy} method="POST">
		<label>{t('home.name')} <input type="text" name="name" value={form?.values?.name ?? ''} /></label>
		<div class="flex flex-wrap gap-2"><button type="submit" class="btn-primary">{t('home.create')}</button>{@render cancel()}</div>
		{#if form?.error}<p role="alert">{t('home.error')}</p>{/if}
	</form>
{/snippet}
</Modal>
