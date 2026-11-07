import { defineConfig } from 'vitest/config';
import path from 'node:path';

const root = path.resolve(__dirname, '../../..');
export default defineConfig({
	root,
	resolve: { alias: { $lib: path.join(root, 'src/lib') } },
	test: { environment: 'node', include: ['tests/acceptance/us-209/srd.unit.ts'], testTimeout: 120000 }
});
