import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		environment: 'node',
		testTimeout: 30000,
		hookTimeout: 30000,
		include: ['src/**/*.{test,spec}.{js,ts}'],
		env: {
			PGLITE_DATA_DIR: 'memory://'
		}
	}
});
