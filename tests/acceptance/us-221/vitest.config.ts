import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('../../..', import.meta.url));

export default defineConfig({
	root,
	resolve: { alias: { $lib: `${root}src/lib` } },
	test: { environment: 'node', include: ['tests/acceptance/us-221/*.unit.ts'], testTimeout: 120000, hookTimeout: 120000 }
});
