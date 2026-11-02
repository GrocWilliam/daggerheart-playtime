<script lang="ts">
	import { translate } from '$lib/i18n';
	import Help from '$lib/Help.svelte';
	let { data, form } = $props();
	const t = (key: string) => translate(data.lang, key);
	const c = $derived(data.campaign);
	const fields = [
		['name', 'field.name', 'text'],
		['class', 'field.class', 'text'],
		['level', 'field.level', 'number'],
		['evasion', 'field.evasion', 'number'],
		['majorThreshold', 'field.majorThreshold', 'number'],
		['severeThreshold', 'field.severeThreshold', 'number'],
		['maxHp', 'field.maxHp', 'number'],
		['maxStress', 'field.maxStress', 'number'],
		['armorSlots', 'field.armorSlots', 'number']
	];
</script>

<p><a href="/">{t('campaign.back')}</a></p>
<h1 data-testid="campaign-name">{c.name}</h1>

{#if form?.error}<p role="alert">{form.error}</p>{/if}

<form method="POST" action="?/fear">
	{t('campaign.fear')}:
	<Help id="fear" name={t('campaign.fear')} lang={data.lang} />
	<button type="submit" name="delta" value="-1">{t('action.decrease')}</button>
	<span data-testid="fear">{c.fear}</span>
	<button type="submit" name="delta" value="1">{t('action.increase')}</button>
</form>

<h2>{t('campaign.characters')}</h2>
<div class="party">
{#each c.characters as ch (ch.id)}
	<article data-testid="character-card">
		<h3>
			<a data-testid="character-name" href="/characters/{ch.id}">{ch.name}</a>
			{#if ch.hp.marked === ch.hp.max}<span data-testid="down">{t('badge.down')}</span>{/if}
		</h3>
		<p class="muted">{ch.class}, {t('character.level')} {ch.level} <Help id="level" name={t('character.level')} lang={data.lang} /></p>
		{#each [['hp', 'tracker.hp'], ['stress', 'tracker.stress'], ['hope', 'tracker.hope'], ['armor', 'tracker.armor']] as [key, label] (key)}
			<form class="tracker" method="POST" action="?/tracker">
				<input type="hidden" name="characterId" value={ch.id} />
				<input type="hidden" name="tracker" value={key} />
				{t(label)}:
				<Help id={key} name={t(label)} lang={data.lang} />
				<button type="submit" name="delta" value="-1">{t('action.decrease')}</button>
				<span data-testid={key}
					>{typeof ch[key] === 'number' ? ch[key] : `${ch[key].marked}/${ch[key].max}`}</span
				>
				<button type="submit" name="delta" value="1">{t('action.increase')}</button>
			</form>
		{/each}
		<ul class="stats">
			<li>{t('stat.evasion')}: <Help id="evasion" name={t('stat.evasion')} lang={data.lang} /> <span data-testid="evasion">{ch.evasion}</span></li>
			<li>{t('stat.thresholds')}: <Help id="thresholds" name={t('stat.thresholds')} lang={data.lang} /> <span data-testid="thresholds">{ch.majorThreshold}/{ch.severeThreshold}</span></li>
		</ul>
		<div>
			{#if ch.conditions.vulnerable}<span data-testid="condition-vulnerable">{t('badge.vulnerable')}</span><Help id="vulnerable" name={t('badge.vulnerable')} lang={data.lang} />{/if}
			{#if ch.conditions.restrained}<span data-testid="condition-restrained">{t('badge.restrained')}</span><Help id="restrained" name={t('badge.restrained')} lang={data.lang} />{/if}
			{#if ch.conditions.hidden}<span data-testid="condition-hidden">{t('badge.hidden')}</span><Help id="hidden" name={t('badge.hidden')} lang={data.lang} />{/if}
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
<form method="POST" action="?/addCharacter">
	{#each fields as [name, label, type] (name)}
		<label>{t(label)} <input {type} {name} required /></label>
	{/each}
	<button type="submit">{t('campaign.add')}</button>
</form>
