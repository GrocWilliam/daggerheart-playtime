<script lang="ts">
	import Divider from '$lib/components/Divider.svelte';
	import { translate } from '$lib/i18n';
	import SrdLines from '$lib/components/SrdLines.svelte';
	import { onMount } from 'svelte';
	import { matches } from '$lib/utils/search';
	let { data } = $props();
	let query = $state(data.q);
	let js = $state(false);
	let pressed = $state<string[]>([]);
	const userOpen = $state<Record<string, boolean>>({});
	const els: Record<string, HTMLDetailsElement | undefined> = {};
	onMount(() => {
		js = true;
	});
	type Item = { id: string; name: string; nameLang?: string; lines: { text: string; label?: string }[] };
	// The server already filtered by name for ?q=: the client filter only applies once the input differs from it.
	const eff = $derived(query === data.q ? '' : query);
	const hasMatch = (s: { items: Item[] }) => s.items.some((i) => matches(eff, i.name, i.lines));
	const shown = (s: { kind: string; items: Item[] }) =>
		(pressed.length === 0 || pressed.includes(s.kind)) && (eff === '' || hasMatch(s));
	function toggleChip(kind: string) {
		pressed = pressed.includes(kind) ? pressed.filter((k) => k !== kind) : [...pressed, kind];
	}
	let wasFiltering = false;
	$effect(() => {
		const filtering = eff !== '';
		// Never close sections the reader opened before hydration: with no ?q= (closed in the server HTML) only touch them while filtering or when filtering ends.
		if (!filtering && !wasFiltering && data.q === '') return;
		wasFiltering = filtering;
		for (const s of data.sections as { kind: string; items: Item[] }[]) {
			const el = els[s.kind];
			if (!el) continue;
			el.open = filtering ? hasMatch(s) : (userOpen[s.kind] ?? false);
		}
	});
	const t = (key: string, params?: Record<string, number>) => translate(data.lang, key, params);
	const kinds = $derived(data.sections.map((s: { kind: string }) => s.kind));
</script>

<svelte:head><title>{t('reference.title')} – {t('home.title')}</title></svelte:head>

<h1>{t('reference.title')}</h1>
<Divider />

<form method="GET" action="/reference" class="flex flex-wrap gap-2 p-2!">
	<label>
		{t('reference.kind')}
		<select name="kind">
			<option value="" selected={data.kind === ''}>{t('reference.all')}</option>
			{#each ['classes', 'subclasses', 'ancestries', 'communities', 'domains', 'domain-cards', 'weapons', 'armors', 'consumables', 'items', 'rules', 'adversaries', 'environments'] as k (k)}
				<option value={k} selected={data.kind === k}>{t(`reference.kind.${k}`)}</option>
			{/each}
		</select>
	</label>
	<label class="mb-0!">{t('reference.search')} <input type="search" name="q" value={data.q} oninput={(e) => (query = e.currentTarget.value)} /></label>
	<button type="submit" class="btn-primary min-h-11 self-end">{t('reference.filter')}</button>
</form>

{#if js}
	<div class="mb-3 flex flex-wrap gap-2">
		{#each kinds as k (k)}
			<button type="button" class="btn-secondary" aria-pressed={pressed.includes(k)} data-testid="ref-chip-{k}" onclick={() => toggleChip(k)}>{t(`reference.kind.${k}`)}</button>
		{/each}
	</div>
{/if}

{#each data.sections as s (s.kind)}
	{#if kinds.includes(s.kind) && (s.items.length > 0 || !data.q)}
		<!-- Closed by default; native disclosures work without JavaScript. -->
		<details
				data-testid="ref-{s.kind}"
				class="mb-2"
				hidden={!shown(s)}
				open={data.q !== ''}
				bind:this={els[s.kind]}
				ontoggle={(e) => {
					if (eff === '') userOpen[s.kind] = e.currentTarget.open;
				}}
			>
			<summary class="flex min-h-11 flex-wrap items-center gap-x-2">
				<h2 class="my-0! inline">{t(`reference.kind.${s.kind}`)}</h2>
				<span class="text-[0.875rem] text-muted">{t('reference.count', { count: s.items.length })}</span>
			</summary>
			<ul class="mt-0 mb-3 grid list-none grid-cols-[minmax(0,1fr)] items-start gap-x-3 pl-0 md:grid-cols-[repeat(2,minmax(0,1fr))]" class:list={true}>
				{#each s.items as item (item.id)}
					<li data-testid="ref-item" hidden={!matches(eff, item.name, item.lines)} class="mb-3 rounded-lg border-l-3 border-accent bg-surface px-3 py-2 wrap-anywhere last:mb-0">
						<details>
							<summary class="flex min-h-11 flex-wrap items-center gap-x-2">
								<span class="font-display" lang={item.nameLang}>{item.name}</span>
								<span class="text-[0.875rem] text-muted">{t(`reference.kind.${s.kind}`)}</span>
							</summary>
							<span class="block text-text"><SrdLines lines={item.lines} lang={data.lang} /></span>
						</details>
					</li>
				{/each}
			</ul>
		</details>
	{/if}
{/each}
