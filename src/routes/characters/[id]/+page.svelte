<script lang="ts">
	import { translate } from '$lib/i18n';
	let { data, form } = $props();
	const t = (key: string) => translate(data.lang, key);
	const c = $derived(data.character);
	const fields = $derived([
		['name', 'field.name', 'text', c.name],
		['class', 'field.class', 'text', c.class],
		['level', 'field.level', 'number', c.level],
		['evasion', 'field.evasion', 'number', c.evasion],
		['majorThreshold', 'field.majorThreshold', 'number', c.majorThreshold],
		['severeThreshold', 'field.severeThreshold', 'number', c.severeThreshold],
		['maxHp', 'field.maxHp', 'number', c.hp.max],
		['maxStress', 'field.maxStress', 'number', c.stress.max],
		['armorSlots', 'field.armorSlots', 'number', c.armor.max]
	]);
	const conditions = ['vulnerable', 'restrained', 'hidden'];
</script>

<p><a href="/campaigns/{c.campaignId}">{t('character.back')}</a></p>
<h1>
	<span data-testid="character-name">{c.name}</span>
	{#if c.hp.marked === c.hp.max}<span data-testid="down">{t('badge.down')}</span>{/if}
</h1>
<p>{c.class}, {t('character.level')} {c.level}</p>

{#if form?.error}<p role="alert">{form.error}</p>{/if}

{#each [['hp', 'tracker.hp'], ['stress', 'tracker.stress'], ['hope', 'tracker.hope'], ['armor', 'tracker.armor']] as [key, label] (key)}
	<form class="tracker" method="POST" action="?/tracker">
		<input type="hidden" name="tracker" value={key} />
		{t(label)}:
		<button type="submit" name="delta" value="-1">{t('action.decrease')}</button>
		<span data-testid={key}
			>{typeof c[key] === 'number' ? c[key] : `${c[key].marked}/${c[key].max}`}</span
		>
		<button type="submit" name="delta" value="1">{t('action.increase')}</button>
	</form>
{/each}
<p>{t('stat.evasion')}: <span data-testid="evasion">{c.evasion}</span></p>
<p>{t('stat.thresholds')}: <span data-testid="thresholds">{c.majorThreshold}/{c.severeThreshold}</span></p>
<p>
	{#if c.conditions.vulnerable}<span data-testid="condition-vulnerable">{t('badge.vulnerable')}</span>{/if}
	{#if c.conditions.restrained}<span data-testid="condition-restrained">{t('badge.restrained')}</span>{/if}
	{#if c.conditions.hidden}<span data-testid="condition-hidden">{t('badge.hidden')}</span>{/if}
</p>

<form method="POST" action="?/damage">
	<label>{t('damage.label')} <input type="number" name="amount" min="0" required /></label>
	<label><input type="checkbox" name="useArmor" /> {t('damage.useArmor')}</label>
	<button type="submit">{t('damage.apply')}</button>
</form>

<h2>{t('section.edit')}</h2>
<form method="POST" action="?/edit">
	{#each fields as [name, label, type, value] (name)}
		<label>{t(label)} <input {type} {name} {value} required /></label>
	{/each}
	<button type="submit">{t('action.save')}</button>
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
<p data-testid="gold">{c.gold.chests} {t('gold.chests')}, {c.gold.bags} {t('gold.bags')}, {c.gold.handfuls} {t('gold.handfuls')}</p>
<form method="POST" action="?/gold">
	<label>{t('gold.adjust')} <input type="number" name="handfuls" step="1" required /></label>
	<button type="submit">{t('action.updateGold')}</button>
</form>

<h2>{t('section.inventory')}</h2>
<form method="POST" action="?/addItem">
	<label>{t('item.name')} <input type="text" name="name" required maxlength="100" /></label>
	<label>{t('item.quantity')} <input type="number" name="quantity" min="1" /></label>
	<button type="submit">{t('action.addItem')}</button>
</form>
<ul>
	{#each c.items as it (it.id)}
		<li>
			<span data-testid="item">{it.name} ×{it.quantity}</span>
			<form method="POST" action="?/setQuantity">
				<input type="hidden" name="itemId" value={it.id} />
				<input type="number" name="quantity" min="0" value={it.quantity} required />
				<button type="submit">{t('action.update')}</button>
			</form>
			<form method="POST" action="?/removeItem">
				<input type="hidden" name="itemId" value={it.id} />
				<button type="submit">{t('action.remove')}</button>
			</form>
		</li>
	{/each}
</ul>
