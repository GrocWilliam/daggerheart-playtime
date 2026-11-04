<script lang="ts">
	import { translate } from '$lib/i18n';
	import Pips from '$lib/Pips.svelte';

	import Help from '$lib/Help.svelte';
	import Chosen from '$lib/Chosen.svelte';
	let { data, form } = $props();
	const t = (key: string) => translate(data.lang, key);
	const c = $derived(data.character);
	const fields = $derived([
		['name', 'field.name', 'text', c.name],
		['level', 'field.level', 'number', c.level],
		['evasion', 'field.evasion', 'number', c.evasion],
		['majorThreshold', 'field.majorThreshold', 'number', c.majorThreshold],
		['severeThreshold', 'field.severeThreshold', 'number', c.severeThreshold],
		['maxHp', 'field.maxHp', 'number', c.hp.max],
		['maxStress', 'field.maxStress', 'number', c.stress.max],
		['armorSlots', 'field.armorSlots', 'number', c.armor.max]
	]);
	// Tracker value colours (hp danger, hope calm); the others keep the text colour.
	const valColour: Record<string, string> = { hp: 'text-danger', hope: 'text-calm' };
	const conditions = ['vulnerable', 'restrained', 'hidden'];
</script>

<p><a href="/campaigns/{c.campaignId}">{t('character.back')}</a></p>
<h1>
	<span data-testid="character-name">{c.name}</span>
	{#if c.hp.marked === c.hp.max}<span class="inline-block rounded-[999px] px-[0.6rem] text-[0.875rem] text-bg bg-danger" data-testid="down">{t('badge.down')}</span>{/if}
</h1>
<p class="muted">{c.class}, {t('character.level')} {c.level} <Help id="level" name={t('character.level')} lang={data.lang} /></p>
<Chosen chosen={data.chosen} lang={data.lang} />

{#if form?.error}<p role="alert">{form.error}</p>{/if}

{#each [['hp', 'tracker.hp'], ['stress', 'tracker.stress'], ['hope', 'tracker.hope'], ['armor', 'tracker.armor']] as [key, label] (key)}
	<form
		class="mb-3 flex flex-nowrap items-center gap-2 rounded-none! bg-transparent! p-0!"
		class:tracker={true}
		method="POST"
		action="?/tracker"
	>
		<input type="hidden" name="tracker" value={key} />
		{t(label)}:
		<Help id={key} name={t(label)} lang={data.lang} />
		<button type="submit" name="delta" value="-1">{t('action.decrease')}</button>
		<span class="min-w-[2ch] text-center {valColour[key]}" data-testid={key}
			>{typeof c[key] === 'number' ? c[key] : `${c[key].marked}/${c[key].max}`}</span
		>
		<button type="submit" name="delta" value="1">{t('action.increase')}</button>
	</form>
	{#if typeof c[key] === 'number'}
		<Pips name={key} max={6} filled={c[key]} />
	{:else}
		<Pips name={key} max={c[key].max} filled={c[key].marked} />
	{/if}
{/each}
<ul class="mt-0 mb-3 list-none pl-0!" class:stats={true}>
	<li>{t('stat.evasion')}: <Help id="evasion" name={t('stat.evasion')} lang={data.lang} /> <span data-testid="evasion">{c.evasion}</span></li>
	<li>{t('stat.thresholds')}: <Help id="thresholds" name={t('stat.thresholds')} lang={data.lang} /> <span data-testid="thresholds">{c.majorThreshold}/{c.severeThreshold}</span></li>
</ul>
<div>
	{#if c.conditions.vulnerable}<span class="inline-block rounded-[999px] px-[0.6rem] text-[0.875rem] text-bg bg-danger" data-testid="condition-vulnerable">{t('badge.vulnerable')}</span><Help id="vulnerable" name={t('badge.vulnerable')} lang={data.lang} />{/if}
	{#if c.conditions.restrained}<span class="inline-block rounded-[999px] px-[0.6rem] text-[0.875rem] text-bg bg-accent" data-testid="condition-restrained">{t('badge.restrained')}</span><Help id="restrained" name={t('badge.restrained')} lang={data.lang} />{/if}
	{#if c.conditions.hidden}<span class="inline-block rounded-[999px] px-[0.6rem] text-[0.875rem] text-bg bg-calm" data-testid="condition-hidden">{t('badge.hidden')}</span><Help id="hidden" name={t('badge.hidden')} lang={data.lang} />{/if}
</div>

<form method="POST" action="?/damage">
	<label>{t('damage.label')} <input type="number" name="amount" min="0" required /></label>
	<label><input type="checkbox" name="useArmor" /> {t('damage.useArmor')}</label>
	<button type="submit">{t('damage.apply')}</button>
</form>

<h2>{t('section.edit')}</h2>
<form method="POST" action="?/edit" class="grid grid-cols-[minmax(0,1fr)] gap-x-4 *:min-w-0 md:grid-cols-[repeat(2,minmax(0,1fr))]" class:form-grid={true}>
	{#each fields.slice(0, 1) as [name, label, type, value] (name)}
		<label>{t(label)} <input {type} {name} {value} required /></label>
	{/each}
	<label>
		{t('field.class')}
		<select name="class">
			{#if !data.picks.classes.some((p: { value: string }) => p.value === c.class)}
				<option value={c.class} selected>{c.class}</option>
			{/if}
			{#each data.picks.classes as p (p.id)}
				<option value={p.value} selected={p.value === c.class}>{p.name}</option>
			{/each}
		</select>
	</label>
	<label>
		{t('field.subclass')}
		<select name="subclass">
			<option value="" selected={!c.subclass}>{t('option.none')}</option>
			{#each data.picks.subclasses as p (p.id)}
				<option value={p.id} selected={p.id === c.subclass}>{p.name}</option>
			{/each}
		</select>
	</label>
	{#each [['ancestry', data.picks.ancestries], ['community', data.picks.communities]] as [k, list] (k)}
		<label>
			{t(`field.${k}`)}
			<select name={k}>
				<option value="" selected={!c[k]}>{t('option.none')}</option>
				{#each list as p (p.id)}
					<option value={p.id} selected={p.id === c[k]}>{p.name}</option>
				{/each}
			</select>
		</label>
	{/each}
	{#each fields.slice(1) as [name, label, type, value] (name)}
		<label>{t(label)} <input {type} {name} {value} required /></label>
	{/each}
	<button type="submit" class="[justify-self:start] md:col-start-1">{t('action.save')}</button>
</form>

<h2>{t('section.conditions')}</h2>
{#each conditions as k (k)}
	<form method="POST" action="?/condition">
		<input type="hidden" name="condition" value={k} />
		<button type="submit" name="value" value={c.conditions[k] ? 'off' : 'on'}>
			{t(`condition.${c.conditions[k] ? 'clear' : 'set'}.${k}`)}
		</button>
	</form>
{/each}

<h2>{t('section.notes')}</h2>
<form method="POST" action="?/notes">
	<textarea name="notes" data-testid="notes" maxlength="5000" rows="6">{c.notes}</textarea>
	<button type="submit">{t('action.saveNotes')}</button>
</form>

<h2>{t('section.gold')}</h2>
<Help id="gold" name={t('section.gold')} lang={data.lang} />
<p data-testid="gold">{c.gold.chests} {t('gold.chests')}, {c.gold.bags} {t('gold.bags')}, {c.gold.handfuls} {t('gold.handfuls')}</p>
<form method="POST" action="?/gold">
	<label>{t('gold.adjust')} <input type="number" name="handfuls" step="1" required /></label>
	<button type="submit">{t('action.updateGold')}</button>
</form>

<h2>{t('section.inventory')}</h2>
<form method="POST" action="?/addItem">
	<label>{t('item.name')} <input type="text" name="name" maxlength="100" /></label>
	<label>
		{t('item.fromSrd')}
		<select name="srdId">
			<option value=""></option>
			{#each data.itemGroups as g (g.kind)}
				<optgroup label={t(`reference.kind.${g.kind}`)}>
					{#each g.picks as p (p.id)}
						<option value={p.id}>{p.name}</option>
					{/each}
				</optgroup>
			{/each}
		</select>
	</label>
	<label>{t('item.quantity')} <input type="number" name="quantity" min="1" /></label>
	<button type="submit">{t('action.addItem')}</button>
</form>
{#if c.items.length > 0}
	<table data-testid="inventory">
		<thead>
			<tr>
				<th scope="col">{t('item.name')}</th>
				<th scope="col">{t('item.quantity')}</th>
				<th scope="col">{t('item.actions')}</th>
			</tr>
		</thead>
		<tbody>
			{#each c.items as it (it.id)}
				<tr data-testid="item-row">
					<td>
						<span data-testid="item">{it.name} ×{it.quantity}</span>
						{#if it.srdId && data.itemPicks[it.srdId]}
							<Help id={it.srdId} name={data.itemPicks[it.srdId].name} lang={data.lang} en={data.itemPicks[it.srdId].en} />
						{/if}
					</td>
					<td>
						<form method="POST" action="?/setQuantity">
							<input type="hidden" name="itemId" value={it.id} />
							<input type="number" name="quantity" min="0" value={it.quantity} required />
							<button type="submit">{t('action.update')}</button>
						</form>
					</td>
					<td>
						<form method="POST" action="?/removeItem">
							<input type="hidden" name="itemId" value={it.id} />
							<button type="submit">{t('action.remove')}</button>
						</form>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<h2>{t('section.cards')}</h2>
<ul class="list-none pl-0!">
	{#each data.cards as card (card.id)}
		<li class="[overflow-wrap:anywhere]" data-testid="card">
			<span>{card.name}</span>
			<span class="muted">{card.domainName}, {t('card.level')} {card.level}</span>
			<Help id={card.id} name={card.name} lang={data.lang} en={card.en} />
			<form method="POST" action="?/removeCard">
				<input type="hidden" name="cardId" value={card.id} />
				<button type="submit">{t('action.remove')}</button>
			</form>
		</li>
	{/each}
</ul>
<form method="POST" action="?/addCard">
	<label>
		{t('card.add')}
		<select name="cardId" required>
			{#each data.cardGroups as g (g.domain)}
				<optgroup label={g.label}>
					{#each g.cards as card (card.id)}
						<option value={card.id}>{card.name}</option>
					{/each}
				</optgroup>
			{/each}
		</select>
	</label>
	<button type="submit">{t('action.addCard')}</button>
</form>
