<script lang="ts">
	import { enhance } from '$app/forms';
	import { busy } from '$lib/forms/busy';
	import { translate, type Lang } from '$lib/i18n';
	import Help from './Help.svelte';
	import Pips from './Pips.svelte';

	// One tracker row: label, help, −, value, + (never wrapping), then the pips (the only part that may wrap).
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
	class="grid grid-cols-[6rem_auto_1fr] items-center gap-2 {band ? 'mb-3! rounded-[0.5rem] border border-border bg-surface px-3! py-2!' : 'mb-1!'}"
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
	<Pips {name} {max} {filled} row size={band ? 'lg' : 'sm'} />
</form>
