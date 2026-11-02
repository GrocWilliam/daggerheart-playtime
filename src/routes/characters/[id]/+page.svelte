<script lang="ts">
	let { data, form } = $props();
	const c = $derived(data.character);
	const fields = $derived([
		['name', 'Name', 'text', c.name],
		['class', 'Class', 'text', c.class],
		['level', 'Level', 'number', c.level],
		['evasion', 'Evasion', 'number', c.evasion],
		['majorThreshold', 'Major threshold', 'number', c.majorThreshold],
		['severeThreshold', 'Severe threshold', 'number', c.severeThreshold],
		['maxHp', 'Max HP', 'number', c.hp.max],
		['maxStress', 'Max stress', 'number', c.stress.max],
		['armorSlots', 'Armor slots', 'number', c.armor.max]
	]);
	const conditions = ['vulnerable', 'restrained', 'hidden'];
</script>

<p><a href="/campaigns/{c.campaignId}">&larr; Campaign</a></p>
<h1>
	<span data-testid="character-name">{c.name}</span>
	{#if c.hp.marked === c.hp.max}<span data-testid="down">Down</span>{/if}
</h1>
<p>{c.class}, level {c.level}</p>

{#if form?.error}<p role="alert">{form.error}</p>{/if}

{#each [['hp', 'HP'], ['stress', 'Stress'], ['hope', 'Hope'], ['armor', 'Armor']] as [key, label] (key)}
	<form class="tracker" method="POST" action="?/tracker">
		<input type="hidden" name="tracker" value={key} />
		{label}:
		<button type="submit" name="delta" value="-1">-</button>
		<span data-testid={key}
			>{typeof c[key] === 'number' ? c[key] : `${c[key].marked}/${c[key].max}`}</span
		>
		<button type="submit" name="delta" value="1">+</button>
	</form>
{/each}
<p>Evasion: <span data-testid="evasion">{c.evasion}</span></p>
<p>Thresholds: <span data-testid="thresholds">{c.majorThreshold}/{c.severeThreshold}</span></p>
<p>
	{#if c.conditions.vulnerable}<span data-testid="condition-vulnerable">Vulnerable</span>{/if}
	{#if c.conditions.restrained}<span data-testid="condition-restrained">Restrained</span>{/if}
	{#if c.conditions.hidden}<span data-testid="condition-hidden">Hidden</span>{/if}
</p>

<form method="POST" action="?/damage">
	<label>Damage <input type="number" name="amount" min="0" required /></label>
	<label><input type="checkbox" name="useArmor" /> use armor</label>
	<button type="submit">Apply damage</button>
</form>

<h2>Edit</h2>
<form method="POST" action="?/edit">
	{#each fields as [name, label, type, value] (name)}
		<label>{label} <input {type} {name} {value} required /></label>
	{/each}
	<button type="submit">Save</button>
</form>

<h2>Conditions</h2>
{#each conditions as k (k)}
	<form method="POST" action="?/condition">
		<input type="hidden" name="condition" value={k} />
		<button type="submit" name="value" value={c.conditions[k] ? 'off' : 'on'}>
			{c.conditions[k] ? `Clear ${k}` : `Set ${k}`}
		</button>
	</form>
{/each}

<h2>Notes</h2>
<form method="POST" action="?/notes">
	<textarea name="notes" data-testid="notes" maxlength="5000" rows="6">{c.notes}</textarea>
	<button type="submit">Save notes</button>
</form>

<h2>Gold</h2>
<p data-testid="gold">{c.gold.chests} chests, {c.gold.bags} bags, {c.gold.handfuls} handfuls</p>
<form method="POST" action="?/gold">
	<label>Handfuls (negative to spend) <input type="number" name="handfuls" step="1" required /></label>
	<button type="submit">Update gold</button>
</form>

<h2>Inventory</h2>
<form method="POST" action="?/addItem">
	<label>Name <input type="text" name="name" required maxlength="100" /></label>
	<label>Quantity <input type="number" name="quantity" min="1" /></label>
	<button type="submit">Add item</button>
</form>
<ul>
	{#each c.items as it (it.id)}
		<li>
			<span data-testid="item">{it.name} ×{it.quantity}</span>
			<form method="POST" action="?/setQuantity">
				<input type="hidden" name="itemId" value={it.id} />
				<input type="number" name="quantity" min="0" value={it.quantity} required />
				<button type="submit">Update</button>
			</form>
			<form method="POST" action="?/removeItem">
				<input type="hidden" name="itemId" value={it.id} />
				<button type="submit">Remove</button>
			</form>
		</li>
	{/each}
</ul>
