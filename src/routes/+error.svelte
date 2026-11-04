<script lang="ts">
	import { page } from '$app/state';
	import { translate } from '$lib/i18n';
	const lang = $derived(page.data?.lang ?? 'en');
	const key = $derived(page.status === 404 ? 'error.page.notFound' : 'error.page.generic');
</script>

<svelte:head><title>{translate(lang, key)}</title></svelte:head>

<h1>{translate(lang, key)}</h1>
<p><a href="/">{translate(lang, 'home.title')}</a></p>
