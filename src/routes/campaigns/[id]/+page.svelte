<script lang="ts">
	// Tracker value colours (hp danger, hope calm); the others keep the text colour.
	const valColour: Record<string, string> = { hp: 'text-danger', hope: 'text-calm' };
	import { translate } from '$lib/i18n';
	import Pips from '$lib/components/Pips.svelte';

	import Help from '$lib/components/Help.svelte';
	import Chosen from '$lib/components/Chosen.svelte';
	let { data, form } = $props();
	const t = (key: string) => translate(data.lang, key);
	const c = $derived(data.campaign);
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

<svelte:head><title>{c.name} – {t('home.title')}</title></svelte:head>

<p><a href="/">{t('campaign.back')}</a></p>
<h1 data-testid="campaign-name">{c.name}</h1>

{#if form?.error}<p role="alert">{t(form.error)}</p>{/if}

<form method="POST" action="?/fear">
	{t('campaign.fear')}:
	<Help id="fear" name={t('campaign.fear')} lang={data.lang} />
	<button type="submit" name="delta" value="-1">{t('action.decrease')}</button>
	<span data-testid="fear">{c.fear}</span>
	<button type="submit" name="delta" value="1">{t('action.increase')}</button>
</form>
<Pips name="fear" max={12} filled={c.fear} />
{#if data.currentScene}<p>{t('campaign.currentScene')}: <strong data-testid="current-scene">{data.currentScene}</strong></p>{/if}
<p><a href="/campaigns/{c.id}/scenario">{t('campaign.scenario')}</a></p>

<h2>{t('campaign.characters')}</h2>
<div class="grid grid-cols-1 gap-4 min-[600px]:grid-cols-2 min-[1024px]:grid-cols-3">
{#each c.characters as ch (ch.id)}
	<article class="mb-0! min-w-0" data-testid="character-card">
		<h3>
			<a data-testid="character-name" href="/characters/{ch.id}">{ch.name}</a>
			{#if ch.hp.marked === ch.hp.max}<span class="inline-block rounded-[999px] px-[0.6rem] text-[0.875rem] text-bg bg-danger" data-testid="down">{t('badge.down')}</span>{/if}
		</h3>
		<p class="muted">{ch.class}, {t('character.level')} {ch.level} <Help id="level" name={t('character.level')} lang={data.lang} /></p>
		<Chosen chosen={(data.chosen as Record<string, never>)[ch.id]} lang={data.lang} />
		{#each [['hp', 'tracker.hp'], ['stress', 'tracker.stress'], ['hope', 'tracker.hope'], ['armor', 'tracker.armor']] as [key, label] (key)}
			<form class="mb-3 flex flex-nowrap items-center gap-2 rounded-none! bg-transparent! p-0!"
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
		<form method="POST" action="?/damage">
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

<h2>{t('campaign.add')}</h2>
<!-- `tracker` and `form-grid` stay as marker classes: frozen tests (us-76, us-77) select on them. -->
<form method="POST" action="?/addCharacter" class="grid grid-cols-1 gap-x-4 md:grid-cols-2"
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
