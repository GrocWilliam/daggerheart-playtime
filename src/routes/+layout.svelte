<script lang="ts">
	import '@fontsource/cinzel/700.css';
	import '@fontsource/eb-garamond/400.css';
	import '@fontsource/eb-garamond/700.css';
	import '../app.css';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import { translate } from '$lib/i18n';
	import { page } from '$app/state';
	import licence from '$lib/srd/LICENSE.md?raw';
	let { children, data } = $props();
	const notice = licence.trim().split(/\n\s*\n/)[0].replace(/\s+/g, ' ');
</script>

<header class="site-header mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-solid border-muted">
	<nav class="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label={translate(data.lang, 'nav.label')}>
		<a class="border-none no-underline aria-[current=page]:border-b-2 aria-[current=page]:border-solid aria-[current=page]:border-accent aria-[current=page]:font-bold" href="/" data-testid="nav-home" aria-current={page.url.pathname === '/' ? 'page' : undefined}>{translate(data.lang, 'home.title')}</a>
		<a
			class="border-none no-underline aria-[current=page]:border-b-2 aria-[current=page]:border-solid aria-[current=page]:border-accent aria-[current=page]:font-bold" 
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
