import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
	root: path.resolve(__dirname, '../../..'),
	test: { environment: 'node', include: ['tests/acceptance/us-129/*.unit.ts'] }
});
