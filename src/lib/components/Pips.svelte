<script lang="ts">
	// `row`: inside a Tracker row, without the bottom margin (the Tracker form has it).
	let { name, max, filled, row = false }: { name: string; max: number; filled: number; row?: boolean } = $props();
	// `pip` and `filled` are marker classes without CSS: frozen tests (us-40) select on them.
	// Full class names so Tailwind finds them; each tracker has its own colour.
	const colours: Record<string, [string, string]> = {
		fear: ['border-danger', 'bg-danger'],
		hp: ['border-danger', 'bg-danger'],
		stress: ['border-accent', 'bg-accent'],
		hope: ['border-calm', 'bg-calm'],
		armor: ['border-muted', 'bg-muted']
	};
	const [border, fill] = $derived(colours[name] ?? colours.armor);
</script>

<div class="{row ? 'mb-0' : 'mb-3'} flex flex-wrap gap-1 text-base" data-testid="{name}-pips" aria-hidden="true"
	>{#each Array.from({ length: max }, (_, i) => i) as i (i)}<span
			class="inline-block size-3 rounded-[50%] border {border} {i < filled ? fill : 'bg-transparent'}"
			class:pip={true}
			class:filled={i < filled}
		></span>{/each}</div
>
