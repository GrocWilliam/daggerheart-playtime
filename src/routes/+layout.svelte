<script lang="ts">
	import '../app.css';
	import LanguageSwitcher from '$lib/LanguageSwitcher.svelte';
	let { children, data } = $props();
</script>

<LanguageSwitcher lang={data.lang} />

{@render children()}
