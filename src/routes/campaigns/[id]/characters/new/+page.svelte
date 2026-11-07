<script lang="ts">
	import { enhance } from '$app/forms';
	import { busy } from '$lib/forms/busy';
	import Divider from '$lib/components/Divider.svelte';
	import { translate, type Params } from '$lib/i18n';
	let { data, form } = $props();
	const t = (key: string, params?: Params) => translate(data.lang, key, params);
	const SELECTS = new Set(['class', 'ancestry', 'community']);
	type PickKey = 'class' | 'ancestry' | 'community';
	// Static class names per step so Tailwind sees them.
	const BAR = ['w-1/4', 'w-2/4', 'w-3/4', 'w-full'];
	const id = $derived(data.campaign.id);
	const TUNNEL_STEPS = $derived(data.steps);
	const current = $derived(TUNNEL_STEPS[data.step - 1]);
	const fields = $derived(current.fields as readonly string[]);
	const others = $derived(
		TUNNEL_STEPS.flatMap((s) => [...s.fields] as string[]).filter((f) => !fields.includes(f) && data.values[f])
	);
	const valueOf = (f: string) => data.values[f] ?? data.defaults[f] ?? '';
	/** Localized label of a picked SRD name; the raw value for free text. */
	const shown = (f: string) => {
		const v = data.values[f] ?? '';
		if (!SELECTS.has(f)) return v;
		return data.picks[f as PickKey].find((o) => o.value === v)?.label ?? v;
	};
	/** Language of a picked SRD label; none (the page's) for free text. */
	const shownLang = (f: string) =>
		SELECTS.has(f) ? data.picks[f as PickKey].find((o) => o.value === (data.values[f] ?? ''))?.lang : undefined;
	const invalidText = $derived(
		data.invalid === null ? null : data.invalid === 'review' ? t('error.invalid') : t('tunnel.invalid', { field: t(`field.${data.invalid}`) })
	);
</script>

<svelte:head><title>{t('campaign.newCharacter')} – {data.campaign.name}</title></svelte:head>

<h1>{t('campaign.newCharacter')}</h1>
<Divider />
<p class="text-muted">{data.campaign.name}</p>

<div class="mb-4" data-testid="tunnel-progress">
	<p class="mb-2 font-bold">{t('tunnel.progress', { n: data.step, total: TUNNEL_STEPS.length })}</p>
	<div class="h-2 w-full overflow-hidden rounded-[0.25rem] bg-surface" aria-hidden="true">
		<div class="h-full bg-accent {BAR[data.step - 1]}"></div>
	</div>
	<ol class="mt-2 flex flex-wrap gap-x-6 gap-y-1 pl-5">
		{#each TUNNEL_STEPS as s, i (s.key)}
			<li class={i + 1 === data.step ? 'font-bold text-accent' : 'text-muted'} aria-current={i + 1 === data.step ? 'step' : undefined}>
				{t(`tunnel.step.${s.key}`)}
			</li>
		{/each}
	</ol>
</div>

{#if invalidText}<p role="alert" class="text-danger">{invalidText}</p>{/if}

<h2>{t(`tunnel.step.${current.key}`)}</h2>

{#if data.step < 4}
	<form method="GET" action="/campaigns/{encodeURIComponent(id)}/characters/new" class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
		<input type="hidden" name="step" value={data.step + 1} />
		{#each others as f (f)}<input type="hidden" name={f} value={data.values[f]} />{/each}
		{#each fields as f (f)}
			<label class="min-w-0">
				{t(`field.${f}`)}
				{#if SELECTS.has(f)}
					<select name={f} required={f === 'class'}>
						{#if f !== 'class'}<option value="">{t('option.none')}</option>{/if}
						{#each data.picks[f as PickKey] as o (o.value)}
							<option value={o.value} lang={o.lang} selected={o.value === valueOf(f)}>{o.label}</option>
						{/each}
					</select>
				{:else if f === 'name'}
					<input type="text" name={f} value={valueOf(f)} required maxlength="100" />
				{:else}
					<input type="number" name={f} value={valueOf(f)} required min={data.ranges[f][0]} max={data.ranges[f][1]} />
				{/if}
			</label>
		{/each}
		<div class="flex flex-wrap items-center gap-4 md:col-span-2">
			{#if data.step === 1}
				<a href="/campaigns/{encodeURIComponent(id)}?step=build" data-testid="tunnel-cancel">{t('tunnel.cancel')}</a>
			{:else}
				<a href={data.hrefs[data.step - 1]} data-testid="tunnel-back">{t('tunnel.back')}</a>
			{/if}
			<button type="submit" data-testid="tunnel-next">{t('tunnel.next')}</button>
		</div>
	</form>
{:else}
	<div data-testid="tunnel-summary">
		{#each TUNNEL_STEPS.slice(0, 3) as s, i (s.key)}
			<section class="mb-4 rounded-[0.5rem] border-2 border-solid border-muted p-3">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<h3 class="my-0!">{t(`tunnel.step.${s.key}`)}</h3>
					<a href={data.hrefs[i + 1]} data-testid="tunnel-edit-{i + 1}">{t('tunnel.edit')}</a>
				</div>
				<dl class="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
					{#each s.fields as f (f)}
						<dt class="text-muted">{t(`field.${f}`)}</dt>
						<dd class="m-0"><span lang={shownLang(f)}>{shown(f) || t('option.none')}</span></dd>
					{/each}
				</dl>
			</section>
		{/each}
	</div>
	{#if form?.error}<p role="alert" class="text-danger">{t(form.error)}</p>{/if}
	<form method="POST" use:enhance={busy} class="flex flex-wrap items-center gap-4">
		{#each TUNNEL_STEPS.flatMap((s) => [...s.fields] as string[]) as f (f)}<input type="hidden" name={f} value={data.values[f] ?? ''} />{/each}
		<a href={data.hrefs[3]} data-testid="tunnel-back">{t('tunnel.back')}</a>
		<button type="submit" data-testid="tunnel-create">{t('tunnel.create')}</button>
	</form>
{/if}
