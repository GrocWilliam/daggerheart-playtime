import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
	root: path.resolve(import.meta.dirname, '../../..'),
	test: { include: ['tests/acceptance/us-248/*.test.ts'], testTimeout: 120000, hookTimeout: 120000 }
});
