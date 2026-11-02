<script lang="ts">
	let { data, form } = $props();
	const c = $derived(data.campaign);
	const fields = [
		['name', 'Name', 'text'],
		['class', 'Class', 'text'],
		['level', 'Level', 'number'],
		['evasion', 'Evasion', 'number'],
		['majorThreshold', 'Major threshold', 'number'],
		['severeThreshold', 'Severe threshold', 'number'],
		['maxHp', 'Max HP', 'number'],
		['maxStress', 'Max stress', 'number'],
		['armorSlots', 'Armor slots', 'number']
	];
</script>

<p><a href="/">&larr; Campaigns</a></p>
<h1 data-testid="campaign-name">{c.name}</h1>

{#if form?.error}<p role="alert">{form.error}</p>{/if}

<form method="POST" action="?/fear">
	Fear:
	<button type="submit" name="delta" value="-1">-</button>
	<span data-testid="fear">{c.fear}</span>
	<button type="submit" name="delta" value="1">+</button>
</form>

<h2>Characters</h2>
{#each c.characters as ch (ch.id)}
	<article data-testid="character-card">
		<h3>
			<a data-testid="character-name" href="/characters/{ch.id}">{ch.name}</a>
			{#if ch.hp.marked === ch.hp.max}<span data-testid="down">Down</span>{/if}
		</h3>
		<p>{ch.class}, level {ch.level}</p>
		{#each [['hp', 'HP'], ['stress', 'Stress'], ['hope', 'Hope'], ['armor', 'Armor']] as [key, label] (key)}
			<form method="POST" action="?/tracker">
				<input type="hidden" name="characterId" value={ch.id} />
				<input type="hidden" name="tracker" value={key} />
				{label}:
				<button type="submit" name="delta" value="-1">-</button>
				<span data-testid={key}
					>{typeof ch[key] === 'number' ? ch[key] : `${ch[key].marked}/${ch[key].max}`}</span
				>
				<button type="submit" name="delta" value="1">+</button>
			</form>
		{/each}
		<p>Evasion: <span data-testid="evasion">{ch.evasion}</span></p>
		<p>
			Thresholds: <span data-testid="thresholds">{ch.majorThreshold}/{ch.severeThreshold}</span>
		</p>
		<p>
			{#if ch.conditions.vulnerable}<span data-testid="condition-vulnerable">Vulnerable</span>{/if}
			{#if ch.conditions.restrained}<span data-testid="condition-restrained">Restrained</span>{/if}
			{#if ch.conditions.hidden}<span data-testid="condition-hidden">Hidden</span>{/if}
		</p>
		<form method="POST" action="?/damage">
			<input type="hidden" name="characterId" value={ch.id} />
			<label>Damage <input type="number" name="amount" min="0" required /></label>
			<label><input type="checkbox" name="useArmor" /> use armor</label>
			<button type="submit">Apply damage</button>
		</form>
	</article>
{:else}
	<p>No characters yet.</p>
{/each}

<h2>Add character</h2>
<form method="POST" action="?/addCharacter">
	{#each fields as [name, label, type] (name)}
		<label>{label} <input {type} {name} required /></label>
	{/each}
	<button type="submit">Add character</button>
</form>
