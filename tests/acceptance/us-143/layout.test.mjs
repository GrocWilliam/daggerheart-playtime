import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const p = (...a) => path.join(ROOT, ...a);
const read = (f) => fs.readFileSync(p(f), 'utf8');
const exists = (f) => fs.existsSync(p(f));
function walk(d) {
	if (!fs.existsSync(d)) return [];
	return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
		const f = path.join(d, e.name);
		return e.isDirectory() ? walk(f) : [f];
	});
}
const rel = (f) => path.relative(ROOT, f);
const SRC = walk(p('src')).filter((f) => /\.(ts|js|svelte|mjs)$/.test(f));
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// parse `import ... from 'x'` and `export ... from 'x'` -> [{names, spec}]
function imports(src) {
	const out = [];
	const re = /\b(?:import|export)\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
	let m;
	while ((m = re.exec(stripComments(src)))) {
		const names = [...m[2].matchAll(/[A-Za-z_$][\w$]*/g)].map((x) => x[0]);
		out.push({ names, spec: m[3], clause: m[2] });
	}
	return out;
}

const MOVED = [
	'src/lib/components/Chosen.svelte',
	'src/lib/components/Help.svelte',
	'src/lib/components/Help.test.ts',
	'src/lib/components/LanguageSwitcher.svelte',
	'src/lib/components/Pips.svelte',
	...['campaigns', 'characters', 'srd', 'language'].map((n) => `src/lib/server/features/${n}.ts`),
	...['campaigns', 'characters', 'traits', 'language', 'srd', 'srd.help', 'srd.search'].map(
		(n) => `src/lib/server/features/${n}.test.ts`
	),
	'src/lib/server/errors.ts',
	'src/lib/utils/validation.ts',
	'src/app.test.ts',
	'src/lib/server/db.ts',
	'src/lib/server/schema.ts',
	'src/lib/server/migrate.ts'
];
const OLD = [
	'src/lib/Chosen.svelte',
	'src/lib/Help.svelte',
	'src/lib/Help.test.ts',
	'src/lib/LanguageSwitcher.svelte',
	'src/lib/Pips.svelte',
	'src/lib/palette.test.ts',
	...['campaigns', 'characters', 'srd', 'language', 'campaigns.test', 'characters.test', 'traits.test', 'language.test', 'srd.test', 'srd.help.test', 'srd.search.test'].map(
		(n) => `src/lib/server/${n}.ts`
	)
];

test('every file of the target layout exists at its new path, none at the old one, and src/lib has only folders at its root', () => {
	for (const f of MOVED) assert.ok(exists(f), `missing ${f}`);
	for (const f of OLD) assert.ok(!exists(f), `still present: ${f}`);
	assert.ok(!exists('src/lib/palette.test.ts'));
	const files = fs.readdirSync(p('src/lib'), { withFileTypes: true }).filter((e) => !e.isDirectory());
	assert.deepEqual(files.map((e) => e.name), []);
	for (const d of ['i18n', 'srd']) assert.ok(exists(`src/lib/${d}`));
});

const ERR = ['ApiError', 'errorResponse', 'api', 'parse', 'readJson'];
const VAL = ['strField', 'intField', 'safeIntField', 'OBJECT_ERROR', 'idSchema'];
const defs = (src, name) =>
	new RegExp(`\\b(?:function|class|const|let|var)\\s+${name}\\b`).test(stripComments(src));

test('ApiError, errorResponse, api, parse, readJson are defined only in server/errors.ts; the field helpers only in utils/validation.ts', () => {
	const code = SRC.filter((f) => !f.endsWith('.svelte') || true);
	for (const [names, home] of [[ERR, 'src/lib/server/errors.ts'], [VAL, 'src/lib/utils/validation.ts']]) {
		for (const n of names) {
			const where = code.filter((f) => defs(fs.readFileSync(f, 'utf8'), n)).map(rel);
			assert.deepEqual(where, [home], `${n} defined in ${JSON.stringify(where)}`);
		}
	}
});

test('no feature imports the shared helpers from another feature', () => {
	const features = walk(p('src/lib/server/features')).filter((f) => f.endsWith('.ts'));
	assert.ok(features.length > 0);
	const bad = [];
	for (const f of features) {
		for (const i of imports(fs.readFileSync(f, 'utf8'))) {
			const target = i.spec.startsWith('.')
				? path.resolve(path.dirname(f), i.spec)
				: i.spec.startsWith('$lib/') ? p('src/lib', i.spec.slice(5)) : null;
			if (!target || !target.startsWith(p('src/lib/server/features') + path.sep)) continue;
			if (target === f.replace(/\.ts$/, '') ) continue;
			for (const n of i.names) if ([...ERR, ...VAL].includes(n)) bad.push(`${rel(f)} imports ${n} from ${i.spec}`);
		}
	}
	assert.deepEqual(bad, []);
});

test('utils/ is pure: no $lib/server, node:, drizzle-orm or @sveltejs/kit', () => {
	const files = walk(p('src/lib/utils')).filter((f) => /\.(ts|js)$/.test(f));
	assert.ok(files.length > 0);
	const bad = [];
	for (const f of files)
		for (const i of imports(fs.readFileSync(f, 'utf8')))
			if (/^(\$lib\/server|node:|drizzle-orm|@sveltejs\/kit)/.test(i.spec) || /server\//.test(i.spec))
				bad.push(`${rel(f)}: ${i.spec}`);
	assert.deepEqual(bad, []);
});

test('no import in src/ points at an old path, and nothing imports json from a feature', () => {
	const bad = [];
	for (const f of SRC) {
		const dir = path.dirname(f);
		for (const i of imports(fs.readFileSync(f, 'utf8'))) {
			let target = null;
			if (i.spec.startsWith('$lib/')) target = p('src/lib', i.spec.slice(5));
			else if (i.spec.startsWith('.')) target = path.resolve(dir, i.spec);
			if (target) {
				const base = target.replace(/\.(ts|js)$/, '');
				const r = path.relative(ROOT, base);
				if (/^src\/lib\/(Chosen|Help|LanguageSwitcher|Pips)\.svelte$/.test(r)) bad.push(`${rel(f)}: ${i.spec}`);
				if (/^src\/lib\/server\/(campaigns|characters|srd|language)(\.|$)/.test(r)) bad.push(`${rel(f)}: ${i.spec}`);
				if (/^src\/lib\/palette/.test(r)) bad.push(`${rel(f)}: ${i.spec}`);
				const resolves = ['', '.ts', '.js', '.svelte', '/index.ts'].some((x) => fs.existsSync(target + x) && fs.statSync(target + x).isFile());
				if (!resolves && !/\.(json|css)$/.test(i.spec) && !/^\$lib\/(srd|i18n)/.test(i.spec) && !/\?/.test(i.spec))
					bad.push(`${rel(f)}: unresolved ${i.spec}`);
				if (/features\//.test(target) && i.names.includes('json') && /\bjson\b/.test(i.clause.replace(/\bjson\w+/g, ''))) bad.push(`${rel(f)}: json from feature`);
			}
		}
	}
	assert.deepEqual(bad, []);
	assert.ok(!/export\s*\{\s*json\s*\}/.test(read('src/lib/server/features/campaigns.ts')));
});

test('CLAUDE.md describes the new layout and the four rules', () => {
	const md = read('CLAUDE.md');
	for (const s of ['src/lib/components/', 'src/lib/server/features/', 'src/lib/server/errors.ts', 'src/lib/utils/validation.ts', 'src/app.test.ts'])
		assert.ok(md.includes(s), `CLAUDE.md lacks ${s}`);
	assert.ok(!md.includes('`src/lib/*.svelte`') && !md.includes('`src/lib/server/*.ts`'), 'old rows remain');
	assert.match(md, /another feature/i, 'rule: no feature imports another feature\'s helpers');
	assert.match(md, /getSrd/, 'rule: example of a feature calling another for domain data');
	assert.match(md, /utils\/[^\n]*pure|pure[^\n]*utils\//i, 'rule: utils is pure');
	assert.match(md, /drizzle-orm/);
	assert.match(md, /beside the Zod schema|next to the Zod schema/i, 'rule: types beside schema');
	assert.match(md, /catch-all/i);
	assert.match(md, /only folders/i, 'rule: src/lib has only folders at root');
});
