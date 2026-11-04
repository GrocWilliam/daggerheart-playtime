<script lang="ts">
	import { translate } from '$lib/i18n';
	import Help from '$lib/components/Help.svelte';
	let { data } = $props();
	const t = (key: string) => translate(data.lang, key);
	const kinds = $derived(data.sections.map((s: { kind: string }) => s.kind));
</script>

<svelte:head><title>{t('reference.title')} – {t('home.title')}</title></svelte:head>

<h1>{t('reference.title')}</h1>

<form method="GET" action="/reference" class="flex flex-wrap gap-2 p-2!">
	<label>
		{t('reference.kind')}
		<select name="kind">
			<option value="" selected={data.kind === ''}>{t('reference.all')}</option>
			{#each ['classes', 'subclasses', 'ancestries', 'communities', 'domains', 'domain-cards', 'weapons', 'armors', 'consumables', 'items', 'rules'] as k (k)}
				<option value={k} selected={data.kind === k}>{t(`reference.kind.${k}`)}</option>
			{/each}
		</select>
	</label>
	<label>{t('reference.search')} <input type="search" name="q" value={data.q} /></label>
	<button type="submit">{t('reference.filter')}</button>
</form>

{#each data.sections as s (s.kind)}
	{#if kinds.includes(s.kind) && (s.items.length > 0 || !data.q)}
		<section data-testid="ref-{s.kind}">
			<h2>{t(`reference.kind.${s.kind}`)}</h2>
			<ul class="mt-0 mb-3 list-none pl-0" class:list={true}>
				{#each s.items as item (item.id)}
					<li data-testid="ref-item" class="mb-3 flex flex-wrap items-center gap-2 rounded-lg border-l-3 border-accent bg-surface px-3 py-2 wrap-anywhere last:mb-0">
						<span>{item.name}</span>
						<Help id={item.id} name={item.name} lang={data.lang} en={item.en} />
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{/each}
