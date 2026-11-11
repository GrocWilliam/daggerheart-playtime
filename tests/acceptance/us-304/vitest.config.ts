import { fileURLToPath } from 'node:url';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('../../..', import.meta.url));

export default defineConfig({
	root,
	plugins: [sveltekit()],
	test: { environment: 'node', include: ['tests/acceptance/us-304/*.unit.ts'], testTimeout: 120000, hookTimeout: 120000 }
});
