<script lang="ts">
	import { enhance } from '$app/forms';
	import { busy } from '$lib/forms/busy';
	import Divider from '$lib/components/Divider.svelte';
	// Tracker value colours (hp danger, hope calm); the others keep the text colour.
	const valColour: Record<string, string> = { hp: 'text-danger', hope: 'text-calm' };
	import { translate } from '$lib/i18n';
	import Pips from '$lib/components/Pips.svelte';

	import Help from '$lib/components/Help.svelte';
	import Chosen from '$lib/components/Chosen.svelte';
	const ADJUSTMENTS = ['easier', 'damageBoost', 'harder'] as const;
	const badge: Record<string, string> = { planned: 'bg-muted', current: 'bg-accent', done: 'bg-calm' };
	let { data, form } = $props();
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
	const c = $derived(data.campaign);
	const cs = $derived(data.scenes.find((x) => x.status === 'current'));
	const fields = [
		['name', 'field.name', 'text'],
		['level', 'field.level', 'number'],
		['evasion', 'field.evasion', 'number'],
		['majorThreshold', 'field.majorThreshold', 'number'],
		['severeThreshold', 'field.severeThreshold', 'number'],
		['maxHp', 'field.maxHp', 'number'],
		['maxStress', 'field.maxStress', 'number'],
		['armorSlots', 'field.armorSlots', 'number']
	];
</script>

{#snippet addForm()}
<!-- `tracker` and `form-grid` stay as marker classes: frozen tests (us-76, us-77) select on them. -->
<form use:enhance={busy} method="POST" action="?/addCharacter" class="px-[0.5625rem]! grid grid-cols-1 gap-x-4 md:grid-cols-2"
	class:form-grid={true}>
	{#each fields as [name, label, type] (name)}
		<label class="min-w-0">{t(label)} <input {type} {name} required /></label>
		{#if name === 'name'}
			{#each ['class', 'ancestry', 'community'] as k (k)}
				<label class="min-w-0">
					{t(`field.${k}`)}
					<select name={k} required={k === 'class'}>
						{#if k !== 'class'}<option value="">{t('option.none')}</option>{/if}
						{#each data.picks[k as 'class' | 'ancestry' | 'community'] as o (o.value)}
							<option value={o.value}>{o.label}</option>
						{/each}
					</select>
				</label>
			{/each}
		{/if}
	{/each}
	<button type="submit" class="justify-self-start md:col-start-1">{t('campaign.add')}</button>
</form>
{/snippet}

{#snippet adversaryStats(a: Adversary)}
	<p><strong lang="en">{a.name}</strong> ×{a.count} · <span lang="en">{a.role}</span></p>
	<ul class="list-none pl-0!">
		<li>{t('encounter.difficulty')}: {a.difficulty}</li>
		<li>{t('encounter.hp')}: {a.hp}</li>
		<li>{t('encounter.stress')}: {a.stress}</li>
		<li>{t('encounter.thresholds')}: {a.thresholds}</li>
		<li>{t('encounter.attack')}: <span lang="en">{a.attack}</span></li>
		<li>{t('encounter.damage')}: <span lang="en">{a.damage}</span></li>
	</ul>
	<details>
		<summary>{t('encounter.features')}</summary>
		{#each a.features as f (f.name)}<p lang="en"><strong>{f.name}</strong>: {f.text}</p>{/each}
	</details>
{/snippet}

{#snippet lootHead(l: LootView)}
	<p>
		<strong>{l.name}</strong>
		<span class="text-muted">{t('loot.roll.label')} {l.roll}</span>
		{#if l.given}<span class="inline-block rounded-[999px] bg-calm px-[0.6rem] text-[0.875rem] text-bg">{t('loot.given')}</span>{/if}
	</p>
	{#if l.features.length}
		<details>
			<summary>{t('loot.features')}</summary>
			{#each l.features as f (f)}<p lang="en">{f}</p>{/each}
		</details>
	{:else}
		<details><summary>{t('loot.features')}</summary><p>{t('loot.noFeatures')}</p></details>
	{/if}
{/snippet}

{#snippet giveForm(sceneId: string, lootId: string, suffix: string)}
		<form use:enhance={busy} class="mb-0! bg-transparent! border-0! p-0!" method="POST" action="?/give{suffix}">
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

{#if form?.error}<p role="alert">{t(form.error)}</p>{/if}

{#if data.step === 'build'}
<section class="rounded-[0.5rem] border-2 border-solid border-muted p-3" data-testid="build">
<div class="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-start">
<div class="min-w-0 md:col-span-1" data-testid="build-party">
<h2>{t('campaign.party')}</h2>
<ul class="list-none pl-0!">
	{#each c.characters as ch (ch.id)}
		<li class="flex min-h-11 flex-wrap items-center gap-2" data-testid="party-member">
			<a data-testid="character-name" href="/characters/{ch.id}">{ch.name}</a>
			<span class="muted">{ch.class}, {t('character.level')} {ch.level}</span>
		</li>
	{:else}
		<li>{t('campaign.none')}</li>
	{/each}
</ul>
<h3>{t('campaign.add')}</h3>
{@render addForm()}
</div>
<div class="min-w-0 md:col-span-2" data-testid="build-scenes">
<h2>{t('campaign.scenes')}</h2>
<h3>{t('scenario.add')}</h3>
<form use:enhance={busy} method="POST" action="?/add&step=build">
	<label>{t('scenario.sceneTitle')} <input name="title" required maxlength="100" /></label>
	<label>{t('scenario.notes')} <textarea name="notes" maxlength="5000"></textarea></label>
	<label>
		{t('scenario.environment')}
		<select name="environmentId">
			<option value="">{t('scenario.noEnvironment')}</option>
			{#each data.environments as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
		</select>
	</label>
	<button type="submit">{t('scenario.add')}</button>
</form>

{#each data.scenes as s, i (s.id)}
	<article class="mb-4 rounded-[0.5rem] border-2 border-solid p-3 {s.status === 'current' ? 'border-accent' : 'border-muted'}"
		data-testid="scene" data-status={s.status} aria-current={s.status === 'current' ? 'true' : undefined}>
		<h3>
			{s.title}
			<span class="inline-block rounded-[999px] px-[0.6rem] text-[0.875rem] text-bg {badge[s.status]}" data-testid="scene-status">{t(`scenario.status.${s.status}`)}</span>
		</h3>
		{#if s.notes}<p class="whitespace-pre-line">{s.notes}</p>{/if}
		{#if s.environment}
			{@const env = s.environment}
			<div data-testid="scene-environment">
				<p><strong lang="en">{env.name}</strong>
					<Help id="environment" name={env.name} lang={data.lang} en={env.features} /></p>
				<ul class="list-none pl-0!">
					<li>{t('scenario.env.type')}: <span lang="en">{env.type}</span></li>
					<li>{t('scenario.env.difficulty')}: {env.difficulty}</li>
					<li>{t('scenario.env.impulses')}: <span lang="en">{env.impulses}</span></li>
				</ul>
			</div>
		{/if}
		<div class="flex flex-wrap gap-2">
			<form use:enhance={busy} class="mb-0! bg-transparent! border-0! p-0!" method="POST" action="?/move&step=build">
				<input type="hidden" name="sceneId" value={s.id} />
				<button type="submit" name="position" value={i - 1} disabled={i === 0}>{t('scenario.moveUp')}</button>
			</form>
			<form use:enhance={busy} class="mb-0! bg-transparent! border-0! p-0!" method="POST" action="?/move&step=build">
				<input type="hidden" name="sceneId" value={s.id} />
				<button type="submit" name="position" value={i + 1} disabled={i === data.scenes.length - 1}>{t('scenario.moveDown')}</button>
			</form>
			<form use:enhance={busy} class="mb-0! bg-transparent! border-0! p-0!" method="POST" action="?/status&step=build">
				<input type="hidden" name="sceneId" value={s.id} />
				{#if s.status !== 'current'}<button type="submit" name="status" value="current">{t('scenario.setCurrent')}</button>{/if}
				{#if s.status !== 'done'}<button type="submit" name="status" value="done">{t('scenario.markDone')}</button>{/if}
			</form>
			<form use:enhance={busy} class="mb-0! bg-transparent! border-0! p-0!" method="POST" action="?/delete&step=build">
				<input type="hidden" name="sceneId" value={s.id} />
				<button type="submit">{t('scenario.delete')}</button>
			</form>
		</div>
		<h4>{t('loot.title')}</h4>
		<form use:enhance={busy} method="POST" action="?/roll&step=build">
			<input type="hidden" name="sceneId" value={s.id} />
			<label>{t('loot.table')}
				<select name="table">
					<option value="items">{t('loot.table.items')}</option>
					<option value="consumables">{t('loot.table.consumables')}</option>
				</select>
			</label>
			<label>{t('loot.rarity')}
				<select name="rarity">
					{#each ['common', 'uncommon', 'rare', 'legendary'] as r (r)}<option value={r}>{t(`loot.rarity.${r}`)}</option>{/each}
				</select>
			</label>
			<label>{t('loot.count')} <input name="count" type="number" min="1" max="10" value="1" required /></label>
			<button type="submit">{t('loot.roll')}</button>
		</form>
		{#each s.loot as l (l.id)}
			<div class="mb-2 rounded-[0.5rem] border-2 border-solid border-muted p-3" data-testid="loot-entry" data-given={l.given}>
				{@render lootHead(l)}
				<div class="flex flex-wrap gap-2">
					{@render giveForm(s.id, l.id, '&step=build')}
					<form use:enhance={busy} class="mb-0! bg-transparent! border-0! p-0!" method="POST" action="?/deleteLoot&step=build">
						<input type="hidden" name="sceneId" value={s.id} />
						<input type="hidden" name="lootId" value={l.id} />
						<button type="submit">{t('loot.delete')}</button>
					</form>
				</div>
			</div>
		{/each}
		<h4>{t('encounter.title')}</h4>
		<form use:enhance={busy} method="POST" action="?/generate&step=build">
			<input type="hidden" name="sceneId" value={s.id} />
			<label>{t('encounter.partySize')} <input name="partySize" type="number" min="1" max="8" value={s.encounter?.partySize ?? data.party.partySize} required /></label>
			<label>{t('encounter.tier')} <input name="tier" type="number" min="1" max="4" value={s.encounter?.tier ?? data.party.tier} required /></label>
			{#each ADJUSTMENTS as a (a)}
				<label><input type="checkbox" name="adjustments" value={a} checked={s.encounter?.adjustments.includes(a) ?? false} /> {t(`encounter.adjust.${a}`)}</label>
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
				<div class="mb-2 rounded-[0.5rem] border-2 border-solid border-muted p-3" data-testid="encounter-adversary">
					{@render adversaryStats(a)}
					<form use:enhance={busy} class="mb-0! bg-transparent! border-0! p-0!" method="POST" action="?/setCount&step=build">
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
			<form use:enhance={busy} class="mb-0! bg-transparent! border-0! p-0!" method="POST" action="?/deleteEncounter&step=build">
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
</section>
{:else}
<section class="rounded-[0.5rem] border-2 border-solid border-muted p-3" data-testid="run">
<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:grid-rows-[auto_1fr] lg:items-start">
<div class="min-w-0 md:col-start-2 md:row-start-1 lg:col-start-1">
<section>
{#if cs}
<div class="flow-root md:mt-[15px] lg:mt-0" data-testid="current-scene">
	<h2>{t('campaign.currentScene')}: {cs.title}</h2>
	{#if cs.environment}
		<div><strong lang="en">{cs.environment.name}</strong>
			<Help id="environment" name={cs.environment.name} lang={data.lang} en={cs.environment.features} /></div>
	{/if}
	<form use:enhance={busy} class="mb-4 bg-transparent! border-0! p-0!" method="POST" action="?/nextScene">
		<button type="submit">{t('run.nextScene')}</button>
	</form>
	{#if cs.encounter}
		{#each cs.encounter.adversaries as a (a.id)}
			<div class="mb-2 rounded-[0.5rem] border-2 border-solid border-muted p-3" data-testid="encounter-adversary">
				{@render adversaryStats(a)}
			</div>
		{/each}
	{/if}
	{#each cs.loot as l (l.id)}
		<div class="mb-2 rounded-[0.5rem] border-2 border-solid border-muted p-3" data-testid="loot-entry" data-given={l.given}>
			{@render lootHead(l)}
			{@render giveForm(cs.id, l.id, '')}
		</div>
	{/each}
	<form use:enhance={busy} class="bg-transparent! border-0! p-0!" method="POST" action="?/edit">
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
	<p>{t('run.noScene')} <a href="?step=build">{t('run.goBuild')}</a></p>
{/if}
</section>
</div>
<div class="min-w-0 md:col-start-1 md:row-start-1 lg:col-start-2">
<form use:enhance={busy} class="flex flex-wrap items-center gap-2" method="POST" action="?/fear">
	{t('campaign.fear')}:
	<Help id="fear" name={t('campaign.fear')} lang={data.lang} />
	<button type="submit" name="delta" value="-1">{t('action.decrease')}</button>
	<span class="order-first -ml-[15px] min-w-[2ch] self-start text-center" data-testid="fear">{c.fear}</span>
	<button type="submit" name="delta" value="1">{t('action.increase')}</button>
</form>
<Pips name="fear" max={12} filled={c.fear} />
</div>
<div class="min-w-0 md:col-span-2 md:row-start-2 lg:col-span-1 lg:col-start-2">
<h2>{t('campaign.characters')}</h2>
<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-1" data-testid="party">
{#each c.characters as ch (ch.id)}
	<article class="mb-0! min-w-0" data-testid="character-card">
		<h3>
			<a data-testid="character-name" href="/characters/{ch.id}">{ch.name}</a>
			{#if ch.hp.marked === ch.hp.max}<span class="inline-block rounded-[999px] px-[0.6rem] text-[0.875rem] text-bg bg-danger" data-testid="down">{t('badge.down')}</span>{/if}
		</h3>
		<div class="muted">{ch.class}, {t('character.level')} {ch.level} <Help id="level" name={t('character.level')} lang={data.lang} /></div>
		<Chosen chosen={(data.chosen as Record<string, never>)[ch.id]} lang={data.lang} />
		{#each [['hp', 'tracker.hp'], ['stress', 'tracker.stress'], ['hope', 'tracker.hope'], ['armor', 'tracker.armor']] as [key, label] (key)}
			<form use:enhance={busy} class="mb-3 flex flex-nowrap items-center gap-2 rounded-none! bg-transparent! border-0! p-0!"
				class:tracker={true} method="POST" action="?/tracker">
				<input type="hidden" name="characterId" value={ch.id} />
				<input type="hidden" name="tracker" value={key} />
				{t(label)}:
				<Help id={key} name={t(label)} lang={data.lang} />
				<button type="submit" name="delta" value="-1">{t('action.decrease')}</button>
				<span class="min-w-[2ch] text-center {valColour[key]}" data-testid={key}
					>{typeof ch[key] === 'number' ? ch[key] : `${ch[key].marked}/${ch[key].max}`}</span
				>
				<button type="submit" name="delta" value="1">{t('action.increase')}</button>
			</form>
			{#if typeof ch[key] === 'number'}
				<Pips name={key} max={6} filled={ch[key]} />
			{:else}
				<Pips name={key} max={ch[key].max} filled={ch[key].marked} />
			{/if}
		{/each}
		<ul class="mt-0 mb-3 list-none pl-0!">
			<li>{t('stat.evasion')}: <Help id="evasion" name={t('stat.evasion')} lang={data.lang} /> <span data-testid="evasion">{ch.evasion}</span></li>
			<li>{t('stat.thresholds')}: <Help id="thresholds" name={t('stat.thresholds')} lang={data.lang} /> <span data-testid="thresholds">{ch.majorThreshold}/{ch.severeThreshold}</span></li>
		</ul>
		<div>
			{#if ch.conditions.vulnerable}<span class="inline-block rounded-[999px] px-[0.6rem] text-[0.875rem] text-bg bg-danger" data-testid="condition-vulnerable">{t('badge.vulnerable')}</span><Help id="vulnerable" name={t('badge.vulnerable')} lang={data.lang} />{/if}
			{#if ch.conditions.restrained}<span class="inline-block rounded-[999px] px-[0.6rem] text-[0.875rem] text-bg bg-accent" data-testid="condition-restrained">{t('badge.restrained')}</span><Help id="restrained" name={t('badge.restrained')} lang={data.lang} />{/if}
			{#if ch.conditions.hidden}<span class="inline-block rounded-[999px] px-[0.6rem] text-[0.875rem] text-bg bg-calm" data-testid="condition-hidden">{t('badge.hidden')}</span><Help id="hidden" name={t('badge.hidden')} lang={data.lang} />{/if}
		</div>
		<form use:enhance={busy} method="POST" action="?/damage">
			<input type="hidden" name="characterId" value={ch.id} />
			<label>{t('damage.label')} <input type="number" name="amount" min="0" required /></label>
			<label><input type="checkbox" name="useArmor" /> {t('damage.useArmor')}</label>
			<button type="submit">{t('damage.apply')}</button>
		</form>
	</article>
{:else}
	<p>{t('campaign.none')}</p>
{/each}
</div>
{@render addForm()}
</div>
<section class="min-w-0 rounded-[0.5rem] border-2 border-solid border-muted p-3 md:col-span-2 md:row-start-3 lg:col-span-1 lg:col-start-1 lg:row-start-2" data-testid="journal">
<h2>{t('journal.title')}</h2>
<Divider />
<form use:enhance={busy} method="POST" action="?/addJournal">
	<label>{t('journal.text')} <textarea name="text" maxlength="2000"></textarea></label>
	<button type="submit">{t('journal.add')}</button>
</form>
{#each data.journal as j (j.id)}
	<div class="mb-2 flex flex-wrap items-center gap-2 rounded-[0.5rem] border-2 border-solid border-muted p-3" data-testid="journal-entry">
		<span class="text-muted">{j.time}</span>
		<p class="m-0 min-w-0 flex-1 whitespace-pre-line">{j.text}</p>
		<form use:enhance={busy} class="mb-0! bg-transparent! border-0! p-0!" method="POST" action="?/deleteJournal">
			<input type="hidden" name="entryId" value={j.id} />
			<button type="submit">{t('journal.delete')}</button>
		</form>
	</div>
{:else}
	<p>{t('journal.none')}</p>
{/each}
</section>
</div>

</section>
{/if}
