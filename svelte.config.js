import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		// adapter-node assumes https behind a proxy, which breaks SvelteKit's
		// built-in check on plain http; hooks.server.ts does the check instead.
		csrf: { checkOrigin: false }
	}
};

export default config;
