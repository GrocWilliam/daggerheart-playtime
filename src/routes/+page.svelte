<script lang="ts">
	let { data, form } = $props();
</script>

<h1>Daggerheart Playtime</h1>

<ul>
	{#each data.campaigns as c (c.id)}
		<li><a data-testid="campaign-link" href="/campaigns/{c.id}">{c.name}</a></li>
	{/each}
</ul>

<form method="POST">
	<label>Name <input type="text" name="name" value={form?.name ?? ''} /></label>
	<button type="submit">Create campaign</button>
	{#if form?.error}<p role="alert">{form.error}</p>{/if}
</form>
