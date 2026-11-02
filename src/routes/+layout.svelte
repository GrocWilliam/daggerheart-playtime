<script lang="ts">
	import '../app.css';
	import LanguageSwitcher from '$lib/LanguageSwitcher.svelte';
	import { translate } from '$lib/i18n';
	import licence from '$lib/srd/LICENSE.md?raw';
	let { children, data } = $props();
	const notice = licence.trim().split(/\n\s*\n/)[0].replace(/\s+/g, ' ');
</script>

<header class="site-header">
	<LanguageSwitcher lang={data.lang} />
	<a href="/reference" class="ref-link">{translate(data.lang, 'nav.reference')}</a>
</header>

{@render children()}

<footer lang="en" data-testid="srd-licence">
	<small>{notice}</small>
</footer>

<style>
	.site-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.ref-link {
		display: inline-flex;
		align-items: center;
		min-height: 2.75rem;
		min-width: 2.75rem;
	}
</style>
