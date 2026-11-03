<script lang="ts">
	import '@fontsource/cinzel/700.css';
	import '@fontsource/eb-garamond/400.css';
	import '@fontsource/eb-garamond/700.css';
	import '../app.css';
	import LanguageSwitcher from '$lib/LanguageSwitcher.svelte';
	import { translate } from '$lib/i18n';
	import { page } from '$app/state';
	import licence from '$lib/srd/LICENSE.md?raw';
	let { children, data } = $props();
	const notice = licence.trim().split(/\n\s*\n/)[0].replace(/\s+/g, ' ');
</script>

<header class="site-header">
	<nav aria-label={translate(data.lang, 'nav.label')}>
		<a href="/" data-testid="nav-home" aria-current={page.url.pathname === '/' ? 'page' : undefined}>{translate(data.lang, 'home.title')}</a>
		<a
			href="/reference"
			data-testid="nav-reference"
			aria-current={page.url.pathname === '/reference' ? 'page' : undefined}
			>{translate(data.lang, 'nav.reference')}</a
		>
	</nav>
	<LanguageSwitcher lang={data.lang} />
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
		justify-content: space-between;
		gap: 0.5rem;
		border-bottom: 1px solid var(--muted);
		margin-bottom: 1rem;
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1rem;
	}
	nav a {
		text-decoration: none;
		border-bottom: none;
	}
	nav a[aria-current='page'] {
		border-bottom: 2px solid var(--accent);
		font-weight: 700;
	}
</style>
