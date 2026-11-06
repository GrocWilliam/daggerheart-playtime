import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: {
		environment: 'node',
		testTimeout: 120000,
		hookTimeout: 120000,
		include: ['src/**/*.{test,spec}.{js,ts}'],
		env: {
			PGLITE_DATA_DIR: 'memory://'
		}
	}
});
