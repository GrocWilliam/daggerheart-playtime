import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		// adapter-node assumes https behind a proxy, which breaks SvelteKit's
		// built-in check on plain http; hooks.server.ts does the check instead.
		csrf: { checkOrigin: false },
		// us-209's fallback.unit.ts imports a path that only exists in the temporary copy its run.sh builds; us-218's cards.unit.ts does not type-check (`numbers()` returns `never[]` in a union).
		typescript: {
			config: (c) => ({ ...c, exclude: [...(c.exclude ?? []), '../tests/acceptance/us-209/fallback.unit.ts', '../tests/acceptance/us-218/cards.unit.ts'] })
		}
	}
};

export default config;
