<script lang="ts">
	import { translate } from '$lib/i18n';
	import Help from '$lib/components/Help.svelte';
	const ADJUSTMENTS = ['easier', 'damageBoost', 'harder'] as const;
	let { data, form } = $props();
	const t = (key: string) => translate(data.lang, key);
	const badge: Record<string, string> = { planned: 'bg-muted', current: 'bg-accent', done: 'bg-calm' };
</script>

<svelte:head><title>{t('scenario.title')} – {t('home.title')}</title></svelte:head>

<p><a href="/campaigns/{data.campaignId}" data-testid="back">{t('scenario.back')}</a></p>
<h1>{t('scenario.title')}</h1>

{#if form?.error}<p role="alert">{t(form.error)}</p>{/if}

<h2>{t('scenario.add')}</h2>
<form method="POST" action="?/add">
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
			<form class="mb-0! bg-transparent! p-0!" method="POST" action="?/move">
				<input type="hidden" name="sceneId" value={s.id} />
				<button type="submit" name="position" value={i - 1} disabled={i === 0}>{t('scenario.moveUp')}</button>
			</form>
			<form class="mb-0! bg-transparent! p-0!" method="POST" action="?/move">
				<input type="hidden" name="sceneId" value={s.id} />
				<button type="submit" name="position" value={i + 1} disabled={i === data.scenes.length - 1}>{t('scenario.moveDown')}</button>
			</form>
			<form class="mb-0! bg-transparent! p-0!" method="POST" action="?/status">
				<input type="hidden" name="sceneId" value={s.id} />
				{#if s.status !== 'current'}<button type="submit" name="status" value="current">{t('scenario.setCurrent')}</button>{/if}
				{#if s.status !== 'done'}<button type="submit" name="status" value="done">{t('scenario.markDone')}</button>{/if}
			</form>
			<form class="mb-0! bg-transparent! p-0!" method="POST" action="?/delete">
				<input type="hidden" name="sceneId" value={s.id} />
				<button type="submit">{t('scenario.delete')}</button>
			</form>
		</div>
		<h4>{t('loot.title')}</h4>
		<form method="POST" action="?/roll">
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
				<div class="flex flex-wrap gap-2">
					<form class="mb-0! bg-transparent! p-0!" method="POST" action="?/give">
						<input type="hidden" name="sceneId" value={s.id} />
						<input type="hidden" name="lootId" value={l.id} />
						<label>{t('loot.giveTo')}
							<select name="characterId" required>
								{#each data.characters as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
							</select>
						</label>
						<button type="submit">{t('loot.give')}</button>
					</form>
					<form class="mb-0! bg-transparent! p-0!" method="POST" action="?/deleteLoot">
						<input type="hidden" name="sceneId" value={s.id} />
						<input type="hidden" name="lootId" value={l.id} />
						<button type="submit">{t('loot.delete')}</button>
					</form>
				</div>
			</div>
		{/each}
		<h4>{t('encounter.title')}</h4>
		<form method="POST" action="?/generate">
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
					<form class="mb-0! bg-transparent! p-0!" method="POST" action="?/setCount">
						<input type="hidden" name="sceneId" value={s.id} />
						<input type="hidden" name="id" value={a.id} />
						<input name="count" type="number" min="1" value={a.count} required aria-label={translate(data.lang, 'encounter.count', { name: a.name })} />
						{#each enc.adversaries.filter((o) => o.id !== a.id) as o (o.id)}
							<input type="hidden" name="id" value={o.id} />
							<input type="hidden" name="count" value={o.count} />
						{/each}
						<button type="submit">{t('encounter.update')}</button>
						<button type="submit" formaction="?/removeAdversary" name="remove" value={a.id} formnovalidate>{t('encounter.remove')}</button>
					</form>
				</div>
			{/each}
			<form class="mb-0! bg-transparent! p-0!" method="POST" action="?/deleteEncounter">
				<input type="hidden" name="sceneId" value={s.id} />
				<button type="submit">{t('encounter.delete')}</button>
			</form>
		{/if}
		<form method="POST" action="?/edit">
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
