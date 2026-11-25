<script lang="ts">
	import { enhance } from '$app/forms';
	import { busy } from '$lib/forms/busy';
	import { translate, type Lang } from '$lib/i18n';
	import Help from './Help.svelte';
	import Pips from './Pips.svelte';

	// `row`: two lines. Line 1 is the label then the nowrap −, value, + group; line 2 is the pips (col-span-full, so they start at the
	// label's left edge). `band` (Fear) keeps one line: label, stepper, pips.
	// `.tracker` is a marker class without CSS: frozen tests select on it.
	let {
		name,
		label,
		helpId,
		value,
		filled,
		max,
		action,
		hidden = {},
		lang,
		variant = 'row'
	}: {
		name: string;
		label: string;
		helpId: string;
		value: string;
		filled: number;
		max: number;
		action: string;
		hidden?: Record<string, string>;
		lang: Lang;
		variant?: 'row' | 'band';
	} = $props();
	const band = $derived(variant === 'band');
	// Tracker value colours (hp danger, hope calm); the others keep the text colour.
	const colours: Record<string, string> = { hp: 'text-danger', hope: 'text-calm' };
</script>

<form
	use:enhance={busy}
	class="grid items-center {band ? 'sticky top-0 z-10 grid-cols-[auto_auto_1fr] gap-1 md:grid-cols-[6rem_auto_1fr] md:gap-2 mb-3! rounded-[0.5rem] border border-border bg-surface px-2! py-1! md:px-3! md:py-2!' : 'grid-cols-[6rem_auto_1fr] gap-x-2 gap-y-1 mb-1!'}"
	class:tracker={true}
	method="POST"
	{action}
>
	{#each Object.entries(hidden) as [k, v] (k)}<input type="hidden" name={k} value={v} />{/each}
	<span class="min-w-0"><Help id={helpId} name={label} {label} {lang} heading={band} /></span>
	<span class="flex flex-nowrap items-center gap-1">
		<button type="submit" name="delta" value="-1" class="btn-ghost">{translate(lang, 'action.decrease')}</button>
		<span class="inline-block w-[3ch] text-center {colours[name] ?? ''}" data-testid={name}>{value}</span>
		<button type="submit" name="delta" value="1" class="btn-ghost">{translate(lang, 'action.increase')}</button>
	</span>
	{#if band}
		<Pips {name} {max} {filled} row size="band" />
	{:else}
		<div class="col-span-full"><Pips {name} {max} {filled} row size="sm" /></div>
	{/if}
</form>
