import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.env.ROOT;
const ACC = join(ROOT, 'tests/acceptance');
const files = [];
(function walk(d) {
	for (const n of readdirSync(d)) {
		const p = join(d, n);
		if (statSync(p).isDirectory()) walk(p);
		else if (p.startsWith(join(ACC, 'us-84'))) continue; // this test describes the patterns
		else if (/\.(sh|mjs|js|ts|py)$/.test(n)) files.push(p);
	}
})(ACC);
const lines = (f) => readFileSync(f, 'utf8').split('\n').map((l, i) => [i + 1, l]);
const runs = files.filter((f) => f.endsWith('/run.sh'));

test('no acceptance script picks a server port with RANDOM, listen(0) or a fixed 20000+ range', () => {
	const bad = [];
	for (const f of files) for (const [n, l] of lines(f)) {
		if (/\bRANDOM\b|listen\(0\b|PORT_N=\$\(\(/.test(l)) bad.push(`${f}:${n}: ${l.trim()}`);
	}
	assert.deepEqual(bad, []);
});

test('every run.sh that starts a server picks a port in 10000-32767', () => {
	const bad = [];
	let servers = 0;
	for (const f of runs) {
		const src = readFileSync(f, 'utf8');
		if (!/node build/.test(src) || !/export PORT=/.test(src)) continue; // (us-2/us-23 wrappers check the default 8080)
		servers++;
		if (!/10000\+Math\.floor\(Math\.random\(\)\*22000\)/.test(src)) bad.push(f);
	}
	assert.ok(servers > 20);
	assert.deepEqual(bad, []);
});

test('the port picker really yields ports in 10000-32767', () => {
	const src = readFileSync(join(ACC, 'us-79/run.sh'), 'utf8');
	const m = src.match(/PORT_N=\$\(node -e "(.*)"\)/);
	assert.ok(m, 'us-79 has the picker');
	for (let i = 0; i < 20; i++) {
		const r = spawnSync('node', ['-e', m[1]], { encoding: 'utf8' });
		const p = Number(r.stdout.trim());
		assert.ok(p >= 10000 && p <= 32767, `port ${p}`);
	}
});

test('no acceptance script installs playwright-core', () => {
	const bad = [];
	for (const f of files) for (const [n, l] of lines(f)) {
		if (/npm (i|install|add)\b.*playwright/.test(l)) bad.push(`${f}:${n}`);
	}
	assert.deepEqual(bad, []);
});

test('scripts use the preinstalled Playwright and never delete it', () => {
	const bad = [];
	for (const f of runs) {
		const src = readFileSync(f, 'utf8');
		if (/PW_DIR=/.test(src) && !/PW_DIR="\$PLAYWRIGHT_DIR"/.test(src)) bad.push(`${f}: PW_DIR`);
		if (/rm -rf[^\n]*\$\{?(PW_DIR|PLAYWRIGHT_DIR|PW)\b/.test(src)) bad.push(`${f}: rm -rf`);
	}
	assert.deepEqual(bad, []);
});

test('make build runs npm ci and npm run build', () => {
	const r = spawnSync('make', ['-n', 'build'], { cwd: ROOT, encoding: 'utf8' });
	assert.equal(r.status, 0, r.stderr);
	const out = r.stdout.split('\n').map((s) => s.trim());
	const ci = out.indexOf('npm ci');
	const b = out.indexOf('npm run build');
	assert.ok(ci >= 0 && b > ci, r.stdout);
});

test('with FORGE_PREBUILT set, no run.sh runs npm run build', () => {
	const bad = [];
	for (const f of [...runs, ...files.filter((x) => x.endsWith('.sh') && !x.endsWith('/run.sh'))]) {
		const ls = lines(f);
		for (const [n, l] of ls) {
			if (!/npm run build/.test(l) || /^\s*#/.test(l) || /grep /.test(l) || /echo "===/.test(l)) continue;
			const guarded = /FORGE_PREBUILT/.test(l);
			let inIf = false;
			for (let i = n - 2; i >= 0 && i >= n - 6; i--) {
				if (/FORGE_PREBUILT/.test(ls[i][1]) && /\bif\b/.test(ls[i][1])) { inIf = true; break; }
			}
			if (!guarded && !inIf) bad.push(`${f}:${n}: ${l.trim()}`);
		}
	}
	assert.deepEqual(bad, []);
});
