<script lang="ts">
	import { enhance } from '$app/forms';
	import { busy } from '$lib/forms/busy';
	import Divider from '$lib/components/Divider.svelte';
	import { translate, type Params } from '$lib/i18n';
	let { data, form } = $props();
	const t = (key: string, params?: Params) => translate(data.lang, key, params);
	const ALL = [
		'newExperience', 'pick1', 'pick2',
		'p1trait1', 'p1trait2', 'p1exp1', 'p1exp2', 'p1card',
		'p2trait1', 'p2trait2', 'p2exp1', 'p2exp2', 'p2card',
		'domainCard'
	];
	const TRAIT_KEYS = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];
	/** Fields each GET step edits (the others ride along as hidden inputs). */
	const STEP_FIELDS: Record<number, string[]> = {
		1: ['newExperience'],
		2: ['pick1', 'pick2'],
		3: ['p1trait1', 'p1trait2', 'p1exp1', 'p1exp2', 'p1card', 'p2trait1', 'p2trait2', 'p2exp1', 'p2exp2', 'p2card'],
		4: ['domainCard']
	};
	const href = $derived(`/characters/${encodeURIComponent(data.character.id)}`);
	const plan = $derived(data.plan);
	const v = (f: string) => (data.values as Record<string, string | undefined>)[f] ?? '';
	const others = $derived(ALL.filter((f) => !(STEP_FIELDS[data.step] ?? []).includes(f) && v(f)));
	const picks = $derived([1, 2].map((n) => ({ n, option: v(`pick${n}`) })).filter((p) => p.option));
	const detailed = $derived(picks.filter((p) => ['traits', 'experiences', 'card', 'subclass'].includes(p.option)));
	const optionLabel = (o: { option: string; slotsLeft: number }) =>
		`${t(`levelup.option.${o.option}`)} (${t('levelup.slotsLeft', { count: o.slotsLeft })})`;
	const bumpable = $derived(data.experiences.filter((e) => e.modifier < 5));
	const grants = $derived(
		[
			plan.achievements.experience ? 'levelup.grant.experience' : '',
			plan.achievements.proficiency ? 'levelup.grant.proficiency' : '',
			plan.achievements.clearTraits ? 'levelup.grant.clearTraits' : '',
			'levelup.grant.base'
		].filter(Boolean)
	);
	/** Label of the step that edits field `f`. */
	const stepLabel = (f: string) => {
		const n = Number(Object.entries(STEP_FIELDS).find(([, fs]) => fs.includes(f))?.[0] ?? 5);
		return t(`levelup.step.${data.steps[n - 1]}`);
	};
	const invalidText = $derived(
		data.invalid === null ? null : data.invalid === 'review' ? t('error.invalid') : t('tunnel.invalid', { field: stepLabel(data.invalid) })
	);
	type Row = { label: string; before: string; after: string };
	const rows = $derived.by((): Row[] => {
		const r = data.review;
		if (!r) return [];
		const out: Row[] = [
			{ label: t('field.level'), before: String(r.before.level), after: String(r.after.level) },
			{ label: t('levelup.proficiency'), before: String(r.before.proficiency), after: String(r.after.proficiency) },
			{ label: t('field.maxHp'), before: String(r.before.hpMax), after: String(r.after.hpMax) },
			{ label: t('field.maxStress'), before: String(r.before.stressMax), after: String(r.after.stressMax) },
			{ label: t('stat.evasion'), before: String(r.before.evasion), after: String(r.after.evasion) },
			{
				label: t('stat.thresholds'),
				before: `${r.before.majorThreshold}/${r.before.severeThreshold}`,
				after: `${r.after.majorThreshold}/${r.after.severeThreshold}`
			}
		];
		const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
		for (const k of TRAIT_KEYS) {
			const b = (r.before.traits as Record<string, number>)[k];
			const a = (r.after.traits as Record<string, number>)[k];
			out.push({ label: t(`trait.${k}`), before: signed(b), after: signed(a) });
		}
		for (const e of r.after.experiences) {
			const b = r.before.experiences.find((x) => x.id === e.id);
			if (b) out.push({ label: e.name, before: signed(b.modifier), after: signed(e.modifier) });
		}
		return out.filter((x, i) => i < 2 || x.before !== x.after);
	});
</script>

<svelte:head><title>{t('levelup.title')} – {data.character.name}</title></svelte:head>

<h1>{t('levelup.title')}</h1>
<Divider />
<p class="text-muted [overflow-wrap:anywhere]">{data.character.name}</p>

<div class="mb-4" data-testid="levelup-progress">
	<p class="mb-2 font-bold">{t('tunnel.progress', { n: data.step, total: data.steps.length })}</p>
	<ol class="m-0 flex list-none flex-wrap gap-2 p-0">
		{#each data.steps as s, i (s)}
			<li
				class="flex min-h-11 items-center gap-2 rounded-[0.5rem] border border-solid border-border px-3 {i + 1 === data.step ? 'bg-accent font-bold text-bg' : i + 1 < data.step ? 'bg-transparent text-accent' : 'bg-transparent text-muted'}"
				aria-current={i + 1 === data.step ? 'step' : undefined}
			>
				<span>{i + 1}</span> {t(`levelup.step.${s}`)}
			</li>
		{/each}
	</ol>
</div>

{#if invalidText}<p role="alert" class="text-danger">{invalidText}</p>{/if}

<h2>{t(`levelup.step.${data.steps[data.step - 1]}`)}</h2>

{#snippet cardSelect(name: string, required: boolean)}
	<select {name} {required} class="min-w-0 max-w-full">
		<option value=""></option>
		{#each data.cardGroups as g (g.domain)}
			<optgroup label={g.label}>
				{#each g.cards as c (c.id)}
					<option value={c.id} lang={c.nameLang} label={c.name} selected={c.id === v(name)}></option>
				{/each}
			</optgroup>
		{/each}
	</select>
{/snippet}

{#if data.step < 5}
	<form method="GET" action="{href}/level-up" class="grid min-w-0 grid-cols-1 gap-x-4">
		<input type="hidden" name="step" value={data.step + 1} />
		{#each others as f (f)}<input type="hidden" name={f} value={v(f)} />{/each}
		{#if data.step === 1}
			<p class="my-0">{t('levelup.reaching', { level: plan.toLevel, tier: plan.tier })}</p>
			<ul>
				{#each grants as g (g)}<li>{t(g)}</li>{/each}
			</ul>
			{#if plan.achievements.experience}
				<label class="min-w-0">
					{t('levelup.newExperience')}
					<input type="text" name="newExperience" value={v('newExperience')} required maxlength="100" />
				</label>
			{:else}
				<p>{t('levelup.none')}</p>
			{/if}
		{:else if data.step === 2}
			{#each [1, 2] as n (n)}
				<label class="min-w-0">
					{t(`levelup.pick${n}`)}
					<select name="pick{n}" required={n === 1} class="min-w-0 max-w-full">
						<option value="">{n === 2 ? t('option.none') : ''}</option>
						{#each plan.options.filter((o) => n === 1 || o.option !== 'proficiency') as o (o.option)}
							<option value={o.option} selected={o.option === v(`pick${n}`)}>{optionLabel(o)}</option>
						{/each}
					</select>
				</label>
			{/each}
		{:else if data.step === 3}
			{#each detailed as p (p.n)}
				<fieldset class="mb-4 min-w-0 rounded-[0.5rem] border-2 border-solid border-muted p-3">
					<legend>{t(`levelup.option.${p.option}`)}</legend>
					{#if p.option === 'traits'}
						{#each [1, 2] as k (k)}
							<label class="min-w-0">
								{t('levelup.choice', { n: k })}
								<select name="p{p.n}trait{k}" required class="min-w-0 max-w-[16rem]!">
									<option value=""></option>
									{#each plan.unmarkedTraits as tr (tr)}
										<option value={tr} selected={tr === v(`p${p.n}trait${k}`)}>{t(`trait.${tr}`)}</option>
									{/each}
								</select>
							</label>
						{/each}
					{:else if p.option === 'experiences'}
						{#each [1, 2] as k (k)}
							<label class="min-w-0">
								{t('levelup.choice', { n: k })}
								<select name="p{p.n}exp{k}" required class="min-w-0 max-w-full">
									<option value=""></option>
									{#each bumpable as e (e.id)}
										<option value={e.id} selected={e.id === v(`p${p.n}exp${k}`)}>{e.name} +{e.modifier}</option>
									{/each}
								</select>
							</label>
						{/each}
					{:else if p.option === 'card'}
						<label class="min-w-0">
							{t('levelup.step.card')}
							{@render cardSelect(`p${p.n}card`, true)}
						</label>
					{:else if data.subclass}
						<p class="my-0 font-bold" lang={data.subclass.nameLang}>{data.subclass.name}</p>
						{#each data.subclass.lines as line, i (i)}
							<p class="[overflow-wrap:anywhere]" lang={line.lang}>{line.text}</p>
						{/each}
					{/if}
				</fieldset>
			{:else}
				<p>{t('levelup.none')}</p>
			{/each}
		{:else}
			<label class="min-w-0">
				{t('levelup.step.card')}
				{@render cardSelect('domainCard', true)}
			</label>
		{/if}
		<div class="flex flex-wrap gap-2">
			<a href={href} class="btn-ghost" data-testid="levelup-cancel">{t('tunnel.cancel')}</a>
			{#if data.step > 1}<a href={data.hrefs[data.step - 1]} class="btn-secondary" data-testid="levelup-back">{t('tunnel.back')}</a>{/if}
			<button type="submit" class="btn-primary" data-testid="levelup-next">{t('tunnel.next')}</button>
		</div>
	</form>
{:else}
	<section data-testid="levelup-summary" class="mb-4 rounded-[0.5rem] border-2 border-solid border-muted p-3">
		<dl class="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
			{#each rows as row (row.label)}
				<dt class="text-muted [overflow-wrap:anywhere]">{row.label}</dt>
				<dd class="m-0">{row.before} → {row.after}</dd>
			{/each}
			{#if data.review?.newExperience}
				<dt class="text-muted">{t('levelup.newExperience')}</dt>
				<dd class="m-0 [overflow-wrap:anywhere]">{data.review.newExperience}</dd>
			{/if}
			{#if data.review?.newCards.length}
				<dt class="text-muted">{t('levelup.newCards')}</dt>
				<dd class="m-0 [overflow-wrap:anywhere]">
					{#each data.review.newCards as c, i (c.id)}{i > 0 ? ', ' : ''}<span lang={c.nameLang}>{c.name}</span>{/each}
				</dd>
			{/if}
		</dl>
	</section>
	{#if form?.error}<p role="alert" class="text-danger">{t(form.error)}</p>{/if}
	<form method="POST" use:enhance={busy} class="flex flex-wrap gap-2">
		{#each ALL as f (f)}{#if v(f)}<input type="hidden" name={f} value={v(f)} />{/if}{/each}
		<a href={href} class="btn-ghost" data-testid="levelup-cancel">{t('tunnel.cancel')}</a>
		<a href={data.hrefs[4]} class="btn-secondary" data-testid="levelup-back">{t('tunnel.back')}</a>
		<button type="submit" class="btn-primary" data-testid="levelup-confirm">{t('levelup.title')}</button>
	</form>
{/if}
