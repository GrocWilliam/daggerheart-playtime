// adapter-node's generated build/index.js defaults PORT to 3000 when unset.
// This story requires a default of 8080, so we rename the generated entry
// point and install a thin wrapper in its place that sets the default
// before handing off.
import fs from 'node:fs';
import path from 'node:path';

const buildDir = path.join(process.cwd(), 'build');
const entry = path.join(buildDir, 'index.js');
const inner = path.join(buildDir, 'server.js');

fs.renameSync(entry, inner);
if (fs.existsSync(`${entry}.map`)) {
	fs.renameSync(`${entry}.map`, `${inner}.map`);
}

const innerSource = fs.readFileSync(inner, 'utf-8');
fs.writeFileSync(inner, innerSource.replace('index.js.map', 'server.js.map'));

fs.writeFileSync(
	entry,
	`process.env.PORT ??= '8080';\nawait import('./server.js');\n`
);
