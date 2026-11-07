// Edits the French overlay files of a COPY of src/lib (never the repository's own files).
// Usage: node mutate.mjs <copy root> <case>
import fs from 'node:fs';
import path from 'node:path';

const [root, which] = process.argv.slice(2);
const dir = path.join(root, 'src/lib/srd/fr');
if (path.resolve(root) === path.resolve(process.cwd())) throw new Error('refusing to mutate the repository');
const edit = (file, fn) => {
	const p = path.join(dir, file);
	const data = JSON.parse(fs.readFileSync(p, 'utf8'));
	fn(data);
	fs.writeFileSync(p, JSON.stringify(data, null, '\t'));
};
const feature = (n) => ({ name: `Trait ${n}`, description: [{ paragraph: `Texte ${n}` }] });
const advFeatures = () => {
	const adv = JSON.parse(fs.readFileSync(path.join(root, 'src/lib/srd/adversaries.json'), 'utf8').replace(/^﻿/, ''));
	return adv.find((a) => a.name === 'Acid Burrower').feature;
};

switch (which) {
	case 'none':
		break;
	case 'unknown-id':
		edit('weapons.json', (d) => { d.core_weapon_nope_zz = { name: 'Inconnue' }; });
		break;
	case 'unknown-id-adversary':
		edit('adversaries.json', (d) => { d.adv_nope_zz = { name: 'Inconnu' }; });
		break;
	case 'extra-field':
		edit('weapons.json', (d) => { d.core_weapon_broadsword = { ...d.core_weapon_broadsword, trait: 'AGILITÉ' }; });
		break;
	case 'wrong-length':
		edit('weapons.json', (d) => { d.core_weapon_broadsword = { ...d.core_weapon_broadsword, features: [feature(1), feature(2)] }; });
		break;
	case 'fallback':
		edit('weapons.json', (d) => {
			// English broadsword has 1 feature: a list of 2 is the wrong shape.
			d.core_weapon_broadsword = { ...d.core_weapon_broadsword, features: [feature(1), feature(2)] };
			// English greatsword has 1 feature with 1 paragraph: this one has the English shape.
			d.core_weapon_greatsword = { ...d.core_weapon_greatsword, features: [{ name: 'Massive FR', description: [{ paragraph: 'Texte massif' }] }] };
		});
		// A string field given as a list is the wrong shape.
		edit('ancestries.json', (d) => { d.core_ancestry_clank = { name: ['Clank FR'] }; });
		edit('adversaries.json', (d) => {
			const f = advFeatures();
			d.adv_acid_burrower = {
				name: 'Fouisseur acide',
				feature: [...f.map((x) => ({ name: x.name, text: x.text })), { name: 'En trop', text: 'En trop' }]
			};
		});
		break;
	default:
		throw new Error(`unknown case ${which}`);
}
