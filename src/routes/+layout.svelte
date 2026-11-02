<script lang="ts">
	import '../app.css';
	import LanguageSwitcher from '$lib/LanguageSwitcher.svelte';
	import licence from '$lib/srd/LICENSE.md?raw';
	let { children, data } = $props();
	const notice = licence.trim().split(/\n\s*\n/)[0].replace(/\s+/g, ' ');
</script>

<LanguageSwitcher lang={data.lang} />

{@render children()}

<footer lang="en" data-testid="srd-licence">
	<small>{notice}</small>
</footer>
