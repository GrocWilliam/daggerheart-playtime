<script lang="ts">
	import { enhance } from '$app/forms';
	import { busy } from '$lib/forms/busy';
	import Divider from '$lib/components/Divider.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Tracker from '$lib/components/Tracker.svelte';
	import DefenseLine from '$lib/components/DefenseLine.svelte';
	import ConditionBadges from '$lib/components/ConditionBadges.svelte';
	import DamageForm from '$lib/components/DamageForm.svelte';
	import { TRACKERS, trackerValues } from '$lib/utils/trackers';
	import { translate } from '$lib/i18n';

	import Help from '$lib/components/Help.svelte';
	const ADJUSTMENTS = ['easier', 'damageBoost', 'harder'] as const;
	const badge: Record<string, string> = { planned: 'bg-muted', current: 'bg-accent', done: 'bg-calm' };
	let { data, form: rawForm } = $props();
	const form = $derived(rawForm as { error?: string; modal?: string; values?: Record<string, string> } | null);
	import { onMount } from 'svelte';
	type Scene = (typeof data.scenes)[number];
	type Adversary = NonNullable<Scene['encounter']>['adversaries'][number];
	type LootView = Scene['loot'][number];
	let js = $state(false);
	onMount(() => (js = true));
	let notesStatus = $state('');
	let notesTimer: ReturnType<typeof setTimeout> | undefined;
	let notesSeq = 0;
	async function saveNotes(sceneId: string, value: string) {
		clearTimeout(notesTimer);
		const seq = ++notesSeq;
		notesStatus = t('run.notes.saving');
		try {
			const res = await fetch(`/api/campaigns/${encodeURIComponent(data.campaign.id)}/scenes/${encodeURIComponent(sceneId)}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ notes: value })
			});
			if (seq === notesSeq) notesStatus = res.ok ? t('run.notes.saved') : t('error.server');
		} catch {
			if (seq === notesSeq) notesStatus = t('error.server');
		}
	}
	function typed(sceneId: string, value: string) {
		clearTimeout(notesTimer);
		notesTimer = setTimeout(() => saveNotes(sceneId, value), 800);
	}
	const t = (key: string) => translate(data.lang, key);
	/** Catalog labels are shown capitalised: they are heading-like values here (the SRD writes `Exploration`). */
	const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
	const envType = (type: string) => cap(t(`environment.type.${type}`));
	const c = $derived(data.campaign);
	const cs = $derived(data.scenes.find((x) => x.status === 'current'));
</script>

{#snippet battleUnits(a: Adversary & { units: { index: number; marked: number; max: number; defeated: boolean }[] }, sceneId: string)}
	{#each a.units as u (u.index)}
		{@const label = a.count > 1 ? `${a.name} ${u.index + 1}` : a.name}
		<div class="mt-2 flex flex-wrap items-center gap-2 {u.defeated ? 'text-muted' : ''}" data-testid="battle-unit" data-adversary={a.id} data-index={u.index}>
			<span lang={a.nameLang}>{label}</span>
			<span data-testid="unit-hp">{u.marked}/{u.max}</span>
			{#if u.defeated}<span data-testid="unit-defeated">{t('battle.defeated')}</span>{:else}
				<form use:enhance={busy} class="mb-0 flex items-center gap-2" method="POST" action="?/battleDamage">
					<input type="hidden" name="sceneId" value={sceneId} />
					<input type="hidden" name="adversaryId" value={a.id} />
					<input type="hidden" name="index" value={u.index} />
					<input class="mb-0! w-20" type="number" name="amount" min="1" max="999" required data-testid="unit-damage" aria-label={translate(data.lang, 'battle.amount', { name: label })} />
					<button type="submit" class="min-h-11 min-w-11" data-testid="unit-hit">{t('battle.hit')}</button>
				</form>
			{/if}
			{#each [{ id: 'unit-hp-plus', d: 1, k: 'battle.hpUp', tx: '+1' }, { id: 'unit-hp-minus', d: -1, k: 'battle.hpDown', tx: '-1' }] as b (b.id)}
				<form use:enhance={busy} class="mb-0" method="POST" action="?/battleHp">
					<input type="hidden" name="sceneId" value={sceneId} />
					<input type="hidden" name="adversaryId" value={a.id} />
					<input type="hidden" name="index" value={u.index} />
					<input type="hidden" name="delta" value={b.d} />
					<button type="submit" class="min-h-11 min-w-11" data-testid={b.id} aria-label={translate(data.lang, b.k, { name: label })}>{b.tx}</button>
				</form>
			{/each}
		</div>
	{/each}
{/snippet}

{#snippet adversaryStats(a: Adversary)}
	<p><strong lang={a.nameLang}>{a.name}</strong> ×{a.count} · <span lang={data.lang}>{cap(t(`adversary.role.${a.role}`))}</span></p>
	<ul class="list-none pl-0!">
		<li>{t('encounter.difficulty')}: {a.difficulty}</li>
		<li>{t('encounter.hp')}: {a.hp}</li>
		<li>{t('encounter.stress')}: {a.stress}</li>
		<li>{t('encounter.thresholds')}: {a.thresholds}</li>
		<li>{t('encounter.attack')}: <span lang={a.attackLang}>{a.attack}</span></li>
		<li>{t('encounter.damage')}: <span>{a.dice}</span>{#if a.damageType}{' '}<span lang={data.lang}>{t(`damage.${a.damageType}`)}</span>{/if}</li>
	</ul>
	<details>
		<summary class="flex min-h-11 items-center">{t('encounter.features')}</summary>
		{#each a.features as f (f.name)}<p lang={f.lang}><strong>{f.name}</strong>: {f.text}</p>{/each}
	</details>
{/snippet}

{#snippet lootHead(l: LootView)}
	<p>
		<strong lang={l.nameLang}>{l.name}</strong>
		<span class="text-muted">{t('loot.roll.label')} {l.roll}</span>
		{#if l.given}<span class="inline-block rounded-[999px] bg-calm px-[0.6rem] text-[0.875rem] text-bg">{t('loot.given')}</span>{/if}
	</p>
	{#if l.features.length}
		<details>
			<summary class="flex min-h-11 items-center">{t('loot.features')}</summary>
			{#each l.features as f, i (i)}<p lang={f.lang}>{f.text}</p>{/each}
		</details>
	{:else}
		<details><summary class="flex min-h-11 items-center">{t('loot.features')}</summary><p>{t('loot.noFeatures')}</p></details>
	{/if}
{/snippet}

{#snippet giveForm(sceneId: string, lootId: string, suffix: string)}
		<form use:enhance={busy} method="POST" action="?/give{suffix}">
			<input type="hidden" name="sceneId" value={sceneId} />
			<input type="hidden" name="lootId" value={lootId} />
			<label>{t('loot.giveTo')}
				<select name="characterId" required>
					{#each data.characters as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
				</select>
			</label>
			<button type="submit">{t('loot.give')}</button>
		</form>
{/snippet}

<svelte:head><title>{c.name} – {t('home.title')}</title></svelte:head>

<p><a href="/">{t('campaign.back')}</a></p>
<h1 data-testid="campaign-name">{c.name}</h1>
<Divider />
<nav class="mb-4 flex gap-4" aria-label={t('step.label')}>
	{#each ['build', 'run'] as k (k)}
		<a class="flex min-h-11 items-center px-3 {data.step === k ? 'font-bold underline' : ''}" data-testid="step-{k}" href="?step={k}"
			aria-current={data.step === k ? 'step' : undefined}>{t(`step.${k}`)}</a>
	{/each}
</nav>

{#if form?.error && form.modal !== 'scene'}<p role="alert">{t(form.error)}</p>{/if}

{#if data.step === 'build'}
<section class="border-none! p-0!" data-testid="build">
<div class="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-start">
<div class="min-w-0 md:col-span-1" data-testid="build-party">
<h2 class="mt-4 mb-2">{t('campaign.party')}</h2>
<ul class="list-none pl-0!">
	{#each c.characters as ch (ch.id)}
		<li class="flex min-h-11 flex-wrap items-center gap-2" data-testid="party-member">
			<a data-testid="character-name" href="/characters/{ch.id}">{ch.name}</a>
			<span class="muted inline-flex items-center gap-1">{ch.class}, {t('character.level')} {ch.level}</span>
		</li>
	{:else}
		<li>{t('campaign.none')}</li>
	{/each}
</ul>
<p><a href="/campaigns/{encodeURIComponent(c.id)}/characters/new" data-testid="new-character">{t('campaign.newCharacter')}</a></p>
</div>
<div class="min-w-0 md:col-span-2" data-testid="build-scenes">
<h2 class="mt-4 mb-2">{t('campaign.scenes')}</h2>
<Modal kind="scene" title={t('scenario.new')} lang={data.lang}>
{#if form?.modal === 'scene' && form.error}<p role="alert">{t(form.error)}</p>{/if}
<form use:enhance={busy} method="POST" action="?/add&step=build">
	<label>{t('scenario.sceneTitle')} <input name="title" value={form?.values?.title ?? ''} required maxlength="100" /></label>
	<label>{t('scenario.notes')} <textarea name="notes" maxlength="5000">{form?.values?.notes ?? ''}</textarea></label>
	<label>
		{t('scenario.environment')}
		<select name="environmentId">
			<option value="">{t('scenario.noEnvironment')}</option>
			{#each data.environments as o (o.id)}<option value={o.id} selected={form?.values?.environmentId === o.id}>{o.name}</option>{/each}
		</select>
	</label>
	<button type="submit">{t('scenario.add')}</button>
</form>
</Modal>

{#each data.scenes as s, i (s.id)}
	<article class="mb-4 rounded-[0.5rem] border-2 border-solid p-3 {s.status === 'current' ? 'border-accent' : 'border-muted'}"
		data-testid="scene" data-status={s.status} aria-current={s.status === 'current' ? 'true' : undefined}>
		<div class="flex flex-wrap items-center gap-x-1 gap-y-0 [&_button]:px-2! [&_button:not([data-testid^=help])]:text-[0.875rem]">
			<h3 class="m-0! mr-1!">{s.title}</h3>
			<span class="inline-block rounded-[999px] px-[0.6rem] text-[0.875rem] text-bg {badge[s.status]}" data-testid="scene-status">{t(`scenario.status.${s.status}`)}</span>
			<form use:enhance={busy} class="mb-0" method="POST" action="?/move&step=build">
				<input type="hidden" name="sceneId" value={s.id} />
				<button type="submit" name="position" value={i - 1} disabled={i === 0}>{t('scenario.moveUp')}</button>
			</form>
			<form use:enhance={busy} class="mb-0" method="POST" action="?/move&step=build">
				<input type="hidden" name="sceneId" value={s.id} />
				<button type="submit" name="position" value={i + 1} disabled={i === data.scenes.length - 1}>{t('scenario.moveDown')}</button>
			</form>
			<form use:enhance={busy} class="mb-0" method="POST" action="?/status&step=build">
				<input type="hidden" name="sceneId" value={s.id} />
				{#if s.status !== 'current'}<button type="submit" name="status" value="current">{t('scenario.setCurrent')}</button>{/if}
				{#if s.status !== 'done'}<button type="submit" name="status" value="done">{t('scenario.markDone')}</button>{/if}
			</form>
			<form use:enhance={busy} class="mb-0" method="POST" action="?/delete&step=build">
				<input type="hidden" name="sceneId" value={s.id} />
				<button type="submit">{t('scenario.delete')}</button>
			</form>
		</div>
		{#if s.notes}<p class="whitespace-pre-line">{s.notes}</p>{/if}
		{#if s.environment}
			{@const env = s.environment}
			<div data-testid="scene-environment">
				<p><strong lang={env.nameLang}>{env.name}</strong>
					<Help id="environment" name={env.name} nameLang={env.nameLang} lang={data.lang} lines={env.features} /></p>
				<ul class="list-none pl-0!">
					<li>{t('scenario.env.type')}: <span lang={data.lang}>{envType(env.type)}</span></li>
					<li>{t('scenario.env.difficulty')}: {env.difficulty}</li>
					<li>{t('scenario.env.impulses')}: <span lang={env.impulsesLang}>{env.impulses}</span></li>
				</ul>
			</div>
		{/if}
		<h4>{t('loot.title')}</h4>
		<form use:enhance={busy} class="flex flex-wrap items-end gap-2" method="POST" action="?/roll&step=build">
			<input type="hidden" name="sceneId" value={s.id} />
			<label class="mb-0!">{t('loot.table')}
				<select name="table">
					<option value="items">{t('loot.table.items')}</option>
					<option value="consumables">{t('loot.table.consumables')}</option>
				</select>
			</label>
			<label class="mb-0!">{t('loot.rarity')}
				<select name="rarity">
					{#each ['common', 'uncommon', 'rare', 'legendary'] as r (r)}<option value={r}>{t(`loot.rarity.${r}`)}</option>{/each}
				</select>
			</label>
			<label class="mb-0!">{t('loot.count')} <input name="count" type="number" min="1" max="10" value="1" required /></label>
			<button type="submit">{t('loot.roll')}</button>
		</form>
		{#each s.loot as l (l.id)}
			<div class="mb-2 rounded-[0.5rem] border-[3px] border-double border-accent bg-surface p-3" data-testid="loot-entry" data-given={l.given}>
				{@render lootHead(l)}
				<div class="flex flex-wrap gap-2">
					{@render giveForm(s.id, l.id, '&step=build')}
					<form use:enhance={busy} method="POST" action="?/deleteLoot&step=build">
						<input type="hidden" name="sceneId" value={s.id} />
						<input type="hidden" name="lootId" value={l.id} />
						<button type="submit">{t('loot.delete')}</button>
					</form>
				</div>
			</div>
		{/each}
		<h4>{t('encounter.title')}</h4>
		<form use:enhance={busy} class="flex flex-wrap items-end gap-2" method="POST" action="?/generate&step=build">
			<input type="hidden" name="sceneId" value={s.id} />
			<label class="mb-0!">{t('encounter.partySize')} <input name="partySize" type="number" min="1" max="8" value={s.encounter?.partySize ?? data.party.partySize} required /></label>
			<label class="mb-0!">{t('encounter.tier')} <input name="tier" type="number" min="1" max="4" value={s.encounter?.tier ?? data.party.tier} required /></label>
			{#each ADJUSTMENTS as a (a)}
				<label class="mb-0!"><input type="checkbox" name="adjustments" value={a} checked={s.encounter?.adjustments.includes(a) ?? false} /> {t(`encounter.adjust.${a}`)}</label>
			{/each}
			<button type="submit">{s.encounter ? t('encounter.regenerate') : t('encounter.generate')}</button>
		</form>
		{#if s.encounter}
			{@const enc = s.encounter}
			<p data-testid="encounter-budget" class="font-bold {enc.over ? 'text-danger' : ''}">
				{t('encounter.budget')}: {enc.spent} / {enc.budget}
				{#if enc.over}<span>({t('encounter.over')})</span>{/if}
			</p>
			{#each enc.adversaries as a (a.id)}
				<div class="mb-2 rounded-[0.5rem] border-[3px] border-double border-accent bg-surface p-3" data-testid="encounter-adversary">
					{@render adversaryStats(a)}
					<form use:enhance={busy} method="POST" action="?/setCount&step=build">
						<input type="hidden" name="sceneId" value={s.id} />
						<input type="hidden" name="id" value={a.id} />
						<input name="count" type="number" min="1" value={a.count} required aria-label={translate(data.lang, 'encounter.count', { name: a.name })} />
						{#each enc.adversaries.filter((o) => o.id !== a.id) as o (o.id)}
							<input type="hidden" name="id" value={o.id} />
							<input type="hidden" name="count" value={o.count} />
						{/each}
						<button type="submit">{t('encounter.update')}</button>
						<button type="submit" formaction="?/removeAdversary&step=build" name="remove" value={a.id} formnovalidate>{t('encounter.remove')}</button>
					</form>
				</div>
			{/each}
			<form use:enhance={busy} method="POST" action="?/deleteEncounter&step=build">
				<input type="hidden" name="sceneId" value={s.id} />
				<button type="submit">{t('encounter.delete')}</button>
			</form>
		{/if}
		<form use:enhance={busy} method="POST" action="?/edit&step=build">
			<input type="hidden" name="sceneId" value={s.id} />
			<label>{t('scenario.sceneTitle')} <input name="title" value={s.title} required maxlength="100" /></label>
			<label>{t('scenario.notes')} <textarea name="notes" maxlength="5000">{s.notes}</textarea></label>
			<label>
				{t('scenario.environment')}
				<select name="environmentId">
					<!-- Labels as attributes keep the option names out of the scene's text content. -->
					<option value="" selected={!s.environmentId} label={t('scenario.noEnvironment')}></option>
					{#each data.environments as o (o.id)}<option value={o.id} selected={o.id === s.environmentId} label={o.name}></option>{/each}
				</select>
			</label>
			<button type="submit">{t('scenario.save')}</button>
		</form>
	</article>
{:else}
	<p>{t('scenario.none')}</p>
{/each}
</div>
</div>
</section>
{:else}
<div data-testid="run">
<Tracker name="fear" label={t('campaign.fear')} helpId="fear" value={String(c.fear)} filled={c.fear} max={12} action="?/fear" lang={data.lang} />
<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1.72fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start">
{#if cs}
<div class="flow-root min-w-0 md:col-span-2 lg:col-span-1 lg:col-start-1 lg:row-start-1" data-testid="current-scene">
	<h2 class="mt-4 mb-2">{t('campaign.currentScene')}: {cs.title}</h2>
	{#if cs.environment}
		<div data-testid="scene-environment"><strong lang={cs.environment.nameLang}>{cs.environment.name}</strong> <span lang={data.lang}>{envType(cs.environment.type)}</span>
			<Help id="environment" name={cs.environment.name} nameLang={cs.environment.nameLang} lang={data.lang} lines={cs.environment.features} />
			<span class="block">{t('scenario.env.impulses')}: <span lang={cs.environment.impulsesLang}>{cs.environment.impulses}</span></span></div>
	{/if}
	<form use:enhance={busy} class="mb-4" method="POST" action="?/nextScene">
		<button type="submit">{t('run.nextScene')}</button>
	</form>
	{#if cs.encounter}
		<p data-testid="encounter-budget" class="font-bold {cs.encounter.over ? 'text-danger' : ''}">
			{t('encounter.budget')}: {cs.encounter.spent} / {cs.encounter.budget}
			{#if cs.encounter.over}<span>({t('encounter.over')})</span>{/if}
		</p>
		{#each cs.encounter.adversaries as a (a.id)}
			<div class="mb-2 rounded-[0.5rem] border-[3px] border-double border-accent bg-surface p-3" data-testid="encounter-adversary" data-adversary={a.id}>
				{@render adversaryStats(a)}
				{@render battleUnits(a, cs.id)}
			</div>
		{/each}
		<form use:enhance={busy} class="mb-2" method="POST" action="?/battleAdd" data-testid="battle-add">
			<input type="hidden" name="sceneId" value={cs.id} />
			<label>{t('battle.addWhich')}
				<select name="adversaryId" required data-testid="battle-add-adversary">
					<option value=""></option>
					{#each data.battleOptions as g (g.tier)}
						<optgroup label="{t('encounter.tier')} {g.tier}">
							{#each g.adversaries as o (o.id)}<option value={o.id} lang={o.nameLang} label={o.name}></option>{/each}
						</optgroup>
					{/each}
				</select>
			</label>
			<label>{t('battle.addQuantity')} <input type="number" name="count" value="1" min="1" max="20" data-testid="battle-add-count" /></label>
			<button type="submit" class="min-h-[44px] min-w-[44px]" data-testid="battle-add-submit">{t('battle.add')}</button>
		</form>
	{/if}
	{#each cs.loot as l (l.id)}
		<div class="mb-2 rounded-[0.5rem] border-[3px] border-double border-accent bg-surface p-3" data-testid="loot-entry" data-given={l.given}>
			{@render lootHead(l)}
			{@render giveForm(cs.id, l.id, '')}
		</div>
	{/each}
	<form use:enhance={busy} method="POST" action="?/edit">
		<input type="hidden" name="sceneId" value={cs.id} />
		<label>{t('scenario.notes')}
			<textarea name="notes" maxlength="5000" data-testid="scene-notes" value={cs.notes}
				oninput={(e) => typed(cs.id, e.currentTarget.value)}
				onblur={(e) => js && saveNotes(cs.id, e.currentTarget.value)}></textarea>
		</label>
		{#if !js}<button type="submit">{t('run.notes.save')}</button>{/if}
		<span data-testid="notes-status" role="status">{notesStatus}</span>
	</form>
</div>
{:else}
<div class="min-w-0 md:col-span-2 lg:col-span-1 lg:col-start-1 lg:row-start-1" data-testid="current-scene">
	<p class="m-0">{t('run.noScene')} <a href="?step=build">{t('run.goBuild')}</a></p>
</div>
{/if}
<div class="grid min-w-0 grid-cols-1 gap-4 md:col-span-2 md:grid-cols-2 lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:grid-cols-1" data-testid="party">
<h2 class="mt-4 mb-2 md:col-span-2 lg:col-span-1">{t('campaign.characters')}</h2>
{#each c.characters as ch (ch.id)}
	<article class="mb-0! min-w-0" data-testid="character-card">
		<div class="flex flex-wrap items-center gap-x-1 gap-y-0 [&_button]:px-2! [&_button:not([data-testid^=help])]:text-[0.875rem]">
			<h3 class="m-0!"><a data-testid="character-name" href="/characters/{ch.id}">{ch.name}</a></h3>
			{#if ch.hp.marked === ch.hp.max}<span class="inline-block rounded-[999px] px-[0.6rem] text-[0.875rem] text-bg bg-danger" data-testid="down">{t('badge.down')}</span>{/if}
			<span class="muted inline-flex items-center gap-1">{ch.class}, {t('character.level')} {ch.level} <Help id="level" name={t('character.level')} lang={data.lang} /></span>
		</div>
		<ConditionBadges conditions={ch.conditions} lang={data.lang} />
		{#each TRACKERS as key (key)}
			<Tracker name={key} label={t(`tracker.${key}`)} helpId={key} action="?/tracker" hidden={{ characterId: ch.id, tracker: key }} lang={data.lang}
				{...trackerValues(ch[key])} />
		{/each}
		<DefenseLine evasion={ch.evasion} major={ch.majorThreshold} severe={ch.severeThreshold} lang={data.lang} />
		<DamageForm action="?/damage" characterId={ch.id} lang={data.lang} />
	</article>
{:else}
	<p>{t('campaign.none')}</p>
{/each}
</div>
<section class="min-w-0 rounded-[0.5rem] border-2 border-solid border-muted p-3 md:col-span-2 lg:col-span-1 lg:col-start-1 lg:row-start-2" data-testid="journal">
<h2 class="mt-4 mb-2">{t('journal.title')}</h2>
<form use:enhance={busy} class="flex flex-wrap items-end gap-2" method="POST" action="?/addJournal">
	<label class="mb-0! min-w-0 flex-1 basis-full md:basis-0">{t('journal.text')} <textarea name="text" maxlength="2000"></textarea></label>
	<button type="submit">{t('journal.add')}</button>
</form>
{#each data.journal as j (j.id)}
	<div class="mb-2 flex flex-wrap items-center gap-2 rounded-[0.5rem] border-2 border-solid border-muted p-3" data-testid="journal-entry">
		<span class="text-muted">{j.time}</span>
		<p class="m-0 min-w-0 flex-1 whitespace-pre-line">{j.text}</p>
		<form use:enhance={busy} method="POST" action="?/deleteJournal">
			<input type="hidden" name="entryId" value={j.id} />
			<button type="submit">{t('journal.delete')}</button>
		</form>
	</div>
{:else}
	<p>{t('journal.none')}</p>
{/each}
</section>
</div>
</div>
{/if}
