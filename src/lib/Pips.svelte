<script lang="ts">
	let { name, max, filled }: { name: string; max: number; filled: number } = $props();
</script>

<div class="pips" data-testid="{name}-pips" aria-hidden="true"
	>{#each Array.from({ length: max }, (_, i) => i) as i (i)}<span
			class="pip"
			class:filled={i < filled}
		></span>{/each}</div
>
