<script lang="ts">
	import { translate } from '$lib/i18n';
	import Help from '$lib/Help.svelte';
	let { data } = $props();
	const t = (key: string) => translate(data.lang, key);
	const kinds = $derived(data.sections.map((s: { kind: string }) => s.kind));
</script>

<h1>{t('reference.title')}</h1>

<form method="GET" action="/reference">
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
			<ul class="ref-list">
				{#each s.items as item (item.id)}
					<li data-testid="ref-item" class="ref-item">
						<span class="ref-name">{item.name}</span>
						<Help id={item.id} name={item.name} lang={data.lang} en={item.en} />
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{/each}

<style>
	.ref-list {
		list-style: none;
		padding: 0;
	}
	.ref-item {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		overflow-wrap: anywhere;
	}
	form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0.5rem;
	}
	select,
	input,
	button {
		min-height: 2.75rem;
	}
</style>
