<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { busy } from '$lib/forms/busy';
	import Divider from '$lib/components/Divider.svelte';
	import { translate, formatNumber, type Lang } from '$lib/i18n';
	import Tracker from '$lib/components/Tracker.svelte';
	import DefenseLine from '$lib/components/DefenseLine.svelte';
	import ConditionBadges from '$lib/components/ConditionBadges.svelte';
	import DamageForm from '$lib/components/DamageForm.svelte';
	import { TRACKERS, trackerValues } from '$lib/utils/trackers';

	import Modal from '$lib/components/Modal.svelte';
	import Help from '$lib/components/Help.svelte';
	import Chosen from '$lib/components/Chosen.svelte';
	import { SHEET_TABS, TAB_LABEL, actionHref } from './tabs';
	let { data, form } = $props();
	const t = (key: string, params?: Record<string, string | number>) => translate(data.lang, key, params);
	const n = (v: number) => formatNumber(data.lang, v);
	const valuesOf = (kind: string): Record<string, any> => (form?.modal === kind ? (form?.values ?? {}) : {});
	const editValues = $derived(valuesOf('edit'));
	const expValues = $derived(valuesOf('experience'));
	const itemValues = $derived(valuesOf('item'));
	const cardValues = $derived(valuesOf('card'));
	// a modal opened (or failed) from another tab still shows, in the header
	const opened = (kind: string) => form?.modal === kind || page.url.searchParams.get('new') === kind;
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
	const traits = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];
	const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);
	const conditions = ['vulnerable', 'restrained', 'hidden'];
</script>

<svelte:head><title>{c.name} – {t('home.title')}</title></svelte:head>

<p><a href="/campaigns/{c.campaignId}">{t('character.back')}</a></p>
<h1>
	<span data-testid="character-name">{c.name}</span>
	{#if c.hp.marked === c.hp.max}<span class="inline-block rounded-[999px] px-[0.6rem] text-[0.875rem] text-bg bg-danger" data-testid="down">{t('badge.down')}</span>{/if}
</h1>
<Divider />
<div class="mb-3 flex flex-wrap items-center gap-x-3">
	<span class="muted">{c.class}, <Help id="level" name={t('character.level')} label={t('character.level')} lang={data.lang} /> {c.level}</span>
	<Chosen chosen={data.chosen} lang={data.lang} />
	{#if data.subclassStage}<span class="muted" data-testid="subclass-stage">{t(`levelup.subclassStage.${data.subclassStage}`)}</span>{/if}
	{#if data.domains.length}
		<ul class="my-0 flex list-none flex-wrap gap-x-4 pl-0!">
			{#each data.domains as d (d.id)}
				<li data-testid="domain"><span lang={d.nameLang}><Help id={d.id} name={d.name} label={d.name} nameLang={d.nameLang} text={d.help} lang={data.lang} /></span></li>
			{/each}
		</ul>
	{/if}
<ConditionBadges conditions={c.conditions} lang={data.lang} />
</div>
<div class="mb-3 flex flex-wrap gap-2"><a class="btn-secondary" data-testid="campaign-run-link" href="/campaigns/{c.campaignId}?step=run">{t('character.runLink')}</a>{#if data.canLevelUp}<a class="btn-secondary" data-testid="level-up" href="/characters/{c.id}/level-up?step=1">{t('levelup.title')}</a>{/if}<Modal kind="edit" openerClass="btn-secondary" params={{ tab: data.tab }} title={t('section.edit')} lang={data.lang}>
<form use:enhance={busy} method="POST" action={actionHref('edit', data.tab)} class="grid grid-cols-[minmax(0,1fr)] gap-x-4 *:min-w-0 min-[600px]:grid-cols-[repeat(2,minmax(0,1fr))]" class:form-grid={true}>
	{#if form?.modal === 'edit' && form.error}<p role="alert" class="col-span-full">{t(form.error)}</p>{/if}
	{#each fields.slice(0, 1) as [name, label, type, value] (name)}
		<label>{t(label)} <input {type} {name} value={editValues[name] ?? value} required /></label>
	{/each}
	<label>
		{t('field.class')}
		<select name="class">
			{#if !data.picks.classes.some((p: { value: string }) => p.value === c.class)}
				<option value={c.class} selected={(editValues.class ?? c.class) === c.class}>{c.class}</option>
			{/if}
			{#each data.picks.classes as p (p.id)}
				<option value={p.value} selected={p.value === (editValues.class ?? c.class)}>{p.name}</option>
			{/each}
		</select>
	</label>
	<label>
		{t('field.subclass')}
		<select name="subclass">
			<option value="" selected={!(editValues.subclass ?? c.subclass)}>{t('option.none')}</option>
			{#if c.subclass && !data.picks.subclasses.some((p: { id: string }) => p.id === c.subclass)}
				<option value={c.subclass} selected={(editValues.subclass ?? c.subclass) === c.subclass}>{c.subclass}</option>
			{/if}
			{#each data.picks.subclasses as p (p.id)}
				<option value={p.id} selected={p.id === (editValues.subclass ?? c.subclass)}>{p.name}</option>
			{/each}
		</select>
	</label>
	{#each [{ k: 'ancestry' as const, list: data.picks.ancestries }, { k: 'community' as const, list: data.picks.communities }] as { k, list } (k)}
		<label>
			{t(`field.${k}`)}
			<select name={k}>
				<option value="" selected={!(editValues[k] ?? c[k])}>{t('option.none')}</option>
				{#if c[k] && !list.some((p: { id: string }) => p.id === c[k])}
					<option value={c[k]} selected={(editValues[k] ?? c[k]) === c[k]}>{c[k]}</option>
				{/if}
				{#each list as p (p.id)}
					<option value={p.id} selected={p.id === (editValues[k] ?? c[k])}>{p.name}</option>
				{/each}
			</select>
		</label>
	{/each}
	{#each fields.slice(1) as [name, label, type, value] (name)}
		<label>{t(label)} <input {type} {name} value={editValues[name] ?? value} required /></label>
	{/each}
	{#each traits as k (k)}
		<div>
			<label>{t(`trait.${k}`)} <input type="number" name="traits.{k}" min="-5" max="5" step="1" value={editValues[`traits.${k}`] ?? c.traits[k]} required /></label>
			{#if opened('edit')}<Help id={k} name={t(`trait.${k}`)} text={t(`trait.help.${k}`)} lang={data.lang} />{/if}
		</div>
	{/each}
	<button type="submit" class="btn-primary [justify-self:start] min-[600px]:col-start-1">{t('action.save')}</button>
</form>
</Modal></div>

{#if data.tab !== 'traits' && opened('experience')}{@render experienceModal()}{/if}
{#if data.tab !== 'gear' && opened('item')}{@render itemModal()}{/if}
{#if data.tab !== 'cards' && opened('card')}{@render cardModal()}{/if}

<nav data-testid="sheet-tabs" class="mb-4 flex gap-1 overflow-x-auto border-b border-solid border-border">
	{#each SHEET_TABS as k (k)}
		<a class="flex min-h-11 shrink-0 items-center px-3 no-underline {data.tab === k ? 'bg-accent font-bold text-bg' : 'bg-transparent text-muted'}" data-testid="tab-{k}" href="?tab={k}"
			aria-current={data.tab === k ? 'page' : undefined}>{t(TAB_LABEL[k])}</a>
	{/each}
</nav>

{#snippet experienceModal()}
<Modal kind="experience" openerClass="btn-secondary" params={{ tab: 'traits' }} title={t('experience.new')} lang={data.lang}>
<form use:enhance={busy} method="POST" action={actionHref('addExperience', data.tab)}>
	<label>{t('experience.name')} <input type="text" name="name" maxlength="100" required value={expValues?.name ?? ''} /></label>
	<label>{t('experience.modifier')} <input type="number" name="modifier" min="1" max="5" step="1" value={expValues?.modifier ?? '2'} required /></label>
	<button type="submit" class="btn-primary">{t('action.addExperience')}</button>
	{#if form?.modal === 'experience' && form?.error}<p role="alert">{t(form.error)}</p>{/if}
</form>
</Modal>
{/snippet}
{#snippet itemModal()}
<Modal kind="item" openerClass="btn-secondary" params={{ tab: 'gear' }} title={t('item.new')} lang={data.lang}>
<form use:enhance={busy} method="POST" action={actionHref('addItem', data.tab)}>
	<label>{t('item.name')} <input type="text" name="name" maxlength="100" value={itemValues?.name ?? ''} /></label>
	<label>
		{t('item.fromSrd')}
		<select name="srdId">
			<option value="" selected={!itemValues?.srdId}></option>
			{#each data.itemGroups as g (g.kind)}
				<optgroup label={t(`reference.kind.${g.kind}`)}>
					{#each g.picks as p (p.id)}
						<option value={p.id} selected={itemValues?.srdId === p.id}>{p.name}</option>
					{/each}
				</optgroup>
			{/each}
		</select>
	</label>
	<label>{t('item.quantity')} <input type="number" name="quantity" min="1" value={itemValues?.quantity ?? ''} /></label>
	<button type="submit" class="btn-primary">{t('action.addItem')}</button>
	{#if form?.modal === 'item' && form?.error}<p role="alert">{t(form.error)}</p>{/if}
</form>
</Modal>
{/snippet}
{#snippet cardModal()}
<Modal kind="card" openerClass="btn-secondary" params={{ tab: 'cards' }} title={t('card.new')} lang={data.lang}>
<form use:enhance={busy} method="POST" action={actionHref('addCard', data.tab)}>
	<label>
		{t('card.add')}
		<select name="cardId" required>
			{#each data.cardGroups as g (g.domain)}
				<optgroup label={g.label}>
					{#each g.cards as card (card.id)}
						<option value={card.id} selected={cardValues?.cardId === card.id}>{card.name}</option>
					{/each}
				</optgroup>
			{/each}
		</select>
	</label>
	<button type="submit" class="btn-primary">{t('action.addCard')}</button>
	{#if form?.modal === 'card' && form?.error}<p role="alert">{t(form.error)}</p>{/if}
</form>
</Modal>
{/snippet}
{#snippet gear(testid: string, g: { name: string; nameLang: Lang; trait?: string; range?: string; dice?: string; damageType?: string; burden?: string; major?: number; severe?: number; score?: number; features: { name: string; text: string; lang: Lang }[] })}
	<div data-testid={testid}>
		<strong lang={g.nameLang}>{g.name}</strong>
		<ul class="mt-0 mb-3 list-none pl-0!">
			{#if g.trait}
				<li>{t('equipment.trait')}: {t(`trait.${g.trait.toLowerCase()}`)}</li>
				<li>{t('equipment.range')}: {t(`range.${g.range}`)}</li>
				<li>{t('equipment.damage')}: {g.dice} {t(`damage.${g.damageType}`)}</li>
				<li>{t('equipment.burden')}: {t(`burden.${g.burden}`)}</li>
			{:else}
				<li>{t('equipment.thresholds')}: {g.major}/{g.severe}</li>
				<li>{t('equipment.score')}: {g.score}</li>
			{/if}
			{#each g.features as f (f.name)}
				<li lang={f.lang}>{f.name}: {f.text}</li>
			{/each}
		</ul>
	</div>
{/snippet}
{#snippet picker(name: string, label: string, groups: { tier: number; picks: { id: string; name: string }[] }[], current: string | null)}
	<form use:enhance={busy} class="flex flex-wrap items-end gap-2" method="POST" action={actionHref('equip', data.tab)}>
		<label class="mb-0! w-full md:w-auto">
			{t(label)}
			<select {name}>
				<option value="" selected={!current}>{t('option.none')}</option>
				{#each groups as g (g.tier)}
					<optgroup label={t('equipment.tier', { tier: g.tier })}>
						{#each g.picks as p (p.id)}
							<option value={p.id} selected={p.id === current}>{p.name}</option>
						{/each}
					</optgroup>
				{/each}
			</select>
		</label>
		<button type="submit" class="btn-primary">{t('action.equip')}</button>
	</form>
{/snippet}
<div data-testid="sheet-panel" class="bg-surface border-[3px] border-double border-accent rounded-[0.5rem] p-3">
<div data-testid="sheet-sections" class="grid grid-cols-[minmax(0,1fr)] gap-x-4 *:min-w-0 {data.tab === 'cards' || data.tab === 'notes' ? '' : 'md:grid-cols-[repeat(2,minmax(0,1fr))]'}">
{#if data.tab === 'play'}
<div data-testid="sheet-trackers">
{#if form?.section === 'sheet-trackers'}<p role="alert">{t(form.error)}</p>{/if}
{#each TRACKERS as key (key)}
	<Tracker name={key} label={t(`tracker.${key}`)} helpId={key} action={actionHref('tracker', data.tab)} hidden={{ tracker: key }} lang={data.lang}
		{...trackerValues(c[key])} />
{/each}
<DefenseLine evasion={c.evasion} major={c.majorThreshold} severe={c.severeThreshold} lang={data.lang} />
<p class="mt-0 mb-3" data-testid="proficiency"><Help id="proficiency" name={t('levelup.proficiency')} label={t('levelup.proficiency')} text={t('levelup.help.proficiency')} lang={data.lang} /> <span>{c.proficiency}</span></p>
<DamageForm action={actionHref('damage', data.tab)} lang={data.lang} />
</div>

<div data-testid="sheet-conditions">
{#if form?.section === 'sheet-conditions'}<p role="alert">{t(form.error)}</p>{/if}
<h2 class="mt-4 mb-2">{t('section.conditions')}</h2>
<div class="flex flex-wrap gap-2">
{#each conditions as k (k)}
	<form use:enhance={busy} method="POST" action={actionHref('condition', data.tab)}>
		<input type="hidden" name="condition" value={k} />
		<button type="submit" class="btn-secondary" aria-pressed={c.conditions[k] ? 'true' : 'false'} name="value" value={c.conditions[k] ? 'off' : 'on'}>
			{t(`condition.${c.conditions[k] ? 'clear' : 'set'}.${k}`)}
		</button>
	</form>
{/each}
</div>
</div>
{/if}

{#if data.tab === 'traits'}
<div data-testid="sheet-traits">
<h2 class="mt-4 mb-2">{t('section.traits')}</h2>
<ul class="mt-0 mb-3 list-none pl-0!">
	{#each traits as k (k)}
		<li class="flex items-center gap-2"><Help id={k} name={t(`trait.${k}`)} label={t(`trait.${k}`)} text={t(`trait.help.${k}`)} lang={data.lang} />{#if c.markedTraits?.includes(k)}<span class="inline-block rounded-[999px] px-[0.6rem] text-[0.875rem] text-bg bg-accent" data-testid="trait-marked-{k}">{t('levelup.marked')}</span>{/if}<span class="ml-auto w-12 text-right" data-testid="trait-{k}">{signed(c.traits[k])}</span></li>
	{/each}
</ul>
</div>

<div data-testid="sheet-experiences">
{#if form?.section === 'sheet-experiences'}<p role="alert">{t(form.error)}</p>{/if}
<h2 class="mt-4 mb-2">{t('section.experiences')}</h2>
{@render experienceModal()}
<ul class="list-none pl-0!">
	{#each c.experiences as ex (ex.id)}
		<li data-testid="experience">
			<span>{ex.name} +{ex.modifier}</span>
			<form use:enhance={busy} class="flex flex-wrap items-end gap-2" method="POST" action={actionHref('setExperience', data.tab)}>
				<input type="hidden" name="expId" value={ex.id} />
				<input type="number" name="modifier" min="1" max="5" step="1" value={ex.modifier} required aria-label={t('experience.modifier')} />
				<button type="submit" class="btn-primary">{t('action.update')}</button>
			</form>
			<form use:enhance={busy} method="POST" action={actionHref('removeExperience', data.tab)}>
				<input type="hidden" name="expId" value={ex.id} />
				<button type="submit" class="btn-danger">{t('action.remove')}</button>
			</form>
		</li>
	{/each}
</ul>
</div>
{/if}

{#if data.tab === 'gear'}
<div data-testid="sheet-equipment">
{#if form?.section === 'sheet-equipment'}<p role="alert">{t(form.error)}</p>{/if}
<h2 class="mt-4 mb-2">{t('section.equipment')}</h2>
{@render picker('primaryWeapon', 'equipment.primary', data.equipment.primary, c.primaryWeapon)}
{#if data.equipment.primaryWeapon}{@render gear('primary-weapon', data.equipment.primaryWeapon)}{/if}
{#if data.equipment.secondaryBlocked}
	<p data-testid="secondary-blocked">{t('equipment.secondaryBlocked')}</p>
{:else}
	{@render picker('secondaryWeapon', 'equipment.secondary', data.equipment.secondary, c.secondaryWeapon)}
{/if}
{#if data.equipment.secondaryWeapon}{@render gear('secondary-weapon', data.equipment.secondaryWeapon)}{/if}
{@render picker('armorId', 'equipment.armor', data.equipment.armors, c.armorId)}
{#if data.equipment.armor}{@render gear('equipped-armor', data.equipment.armor)}{/if}
</div>

<div data-testid="sheet-gold">
{#if form?.section === 'sheet-gold'}<p role="alert">{t(form.error)}</p>{/if}
<h2 class="mt-4 mb-2">{t('section.gold')}</h2>
<Help id="gold" name={t('section.gold')} lang={data.lang} />
<p data-testid="gold">{n(c.gold.chests)} {t('gold.chests')}, {n(c.gold.bags)} {t('gold.bags')}, {n(c.gold.handfuls)} {t('gold.handfuls')}</p>
<form use:enhance={busy} class="flex flex-wrap items-end gap-2" method="POST" action={actionHref('gold', data.tab)}>
	<label class="mb-0! w-full md:w-auto">{t('gold.adjust')} <input type="number" name="handfuls" step="1" required /></label>
	<button type="submit" class="btn-primary">{t('action.updateGold')}</button>
</form>
</div>

<div data-testid="sheet-inventory" class="md:col-span-2">
{#if form?.section === 'sheet-inventory'}<p role="alert">{t(form.error)}</p>{/if}
<h2 class="mt-4 mb-2">{t('section.inventory')}</h2>
{@render itemModal()}
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
				{@const shown = it.srdId && data.itemPicks[it.srdId]?.nameLang === data.lang ? data.itemPicks[it.srdId].name : it.name}
				<tr data-testid="item-row">
					<td>
						<span data-testid="item" lang={shown === it.name ? undefined : data.lang}>{shown}{shown === it.name ? '' : ` (${it.name})`} ×{n(it.quantity)}</span>
						{#if it.srdId && data.itemPicks[it.srdId]}
							{@const pick = data.itemPicks[it.srdId]}
							<Help id={it.srdId} name={pick.name} nameLang={pick.nameLang} lang={data.lang} lines={pick.lines} />
						{/if}
					</td>
					<td>
						<form use:enhance={busy} class="flex min-w-max flex-wrap items-end gap-2" method="POST" action={actionHref('setQuantity', data.tab)}>
							<input type="hidden" name="itemId" value={it.id} />
							<input class="w-[6rem]! min-w-0!" type="number" name="quantity" min="0" value={it.quantity} required />
							<button type="submit" class="btn-primary">{t('action.update')}</button>
						</form>
					</td>
					<td>
						<form use:enhance={busy} class="flex flex-nowrap items-center gap-2" method="POST" action={actionHref('removeItem', data.tab)}>
							<input type="hidden" name="itemId" value={it.id} />
							<button type="submit" class="btn-danger">{t('action.remove')}</button>
						</form>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}
</div>

{/if}

{#if data.tab === 'cards'}
<div data-testid="sheet-cards">
{#if form?.section === 'sheet-cards'}<p role="alert">{t(form.error)}</p>{/if}
<h2 class="mt-4 mb-2">{t('section.cards')}</h2>
<ul class="list-none pl-0!">
	{#each data.cards as card (card.id)}
		<li class="[overflow-wrap:anywhere]" data-testid="card">
			<span lang={card.nameLang}>{card.name}</span>
			<span class="muted"><span lang={card.domainNameLang}>{card.domainName}</span>, {t('card.level')} {card.level}</span>
			<Help id={card.id} name={card.name} nameLang={card.nameLang} lang={data.lang} lines={card.lines} />
			<form use:enhance={busy} method="POST" action={actionHref('removeCard', data.tab)}>
				<input type="hidden" name="cardId" value={card.id} />
				<button type="submit" class="btn-danger">{t('action.remove')}</button>
			</form>
		</li>
	{/each}
</ul>
{@render cardModal()}
</div>
{/if}

{#if data.tab === 'notes'}
<div data-testid="sheet-notes">
{#if form?.section === 'sheet-notes'}<p role="alert">{t(form.error)}</p>{/if}
<h2 class="mt-4 mb-2">{t('section.notes')}</h2>
<form use:enhance={busy} method="POST" action={actionHref('notes', data.tab)}>
	<textarea name="notes" data-testid="notes" maxlength="5000" rows="6">{c.notes}</textarea>
	<button type="submit" class="btn-primary">{t('action.saveNotes')}</button>
</form>
</div>
{/if}
</div>
</div>
