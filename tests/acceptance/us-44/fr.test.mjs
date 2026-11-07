import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE = process.env.BASE_URL;
const DIR = 'src/lib/srd';
const KINDS = {
	classes: 'classes.json', subclasses: 'subclasses.json', ancestries: 'ancestries.json', communities: 'communities.json',
	'domain-cards': 'domain-cards.json', weapons: 'weapons.json', armors: 'armors.json', consumables: 'consumables.json',
	items: 'items.json', rules: 'rules.json'
};
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
// French names live in the overlay files src/lib/srd/fr/<kind>.json: {"<id>": {"name": ...}}
const FR_DIR = 'src/lib/srd/fr';
const frFiles = () => fs.readdirSync(FR_DIR).filter((f) => f.endsWith('.json')).map((f) => readJson(`${FR_DIR}/${f}`));
const hasName = (e) => e && typeof e === 'object' && 'name' in e;
const frNames = () => Object.assign({}, ...frFiles().map((d) => Object.fromEntries(Object.entries(d).filter(([, e]) => hasName(e)).map(([id, e]) => [id, e.name]))));
const file = (n) => readJson(`${DIR}/core/${n}`);
const get = (path, lang) => fetch(BASE + path, { headers: lang ? { cookie: `lang=${lang}` } : {} });
const enName = (kind, e) => (kind === 'classes' ? e.name[0] + e.name.slice(1).toLowerCase() : e.name['en-US']);
const DOMAINS = ['Arcana', 'Blade', 'Bone', 'Codex', 'Grace', 'Midnight', 'Sage', 'Splendor', 'Valor'];
const domId = (n) => `core_domain_${n.toLowerCase()}`;

const FIXED = {
	classes: ['Barde', 'Druide', 'Gardien', 'Rôdeur', 'Roublard', 'Séraphin', 'Ensorceleur', 'Guerrier', 'Magicien'],
	domains: ['Arcanes', 'Lame', 'Os', 'Codex', 'Grâce', 'Minuit', 'Sage', 'Splendeur', 'Bravoure'],
	ancestries: ['Clank', 'Drakona', 'Nain', 'Elfe', 'Fée', 'Faune', 'Firbolg', 'Fungril', 'Galapa', 'Géant', 'Gobelin', 'Halfelin', 'Humain', 'Infernis', 'Katari', 'Orque', 'Ribbet', 'Simiah'],
	communities: ['Haut-né', 'Né du savoir', "Né de l'ordre", 'Né des crêtes', 'Né des mers', 'Né de la ruse', 'Né des profondeurs', "Né de l'errance", 'Né des terres sauvages'],
	subclasses: ['Lié aux bêtes', 'Appel du brave', 'Appel du tueur', 'Porteur divin', 'Origine élémentaire', 'Marcheur de nuit', 'Origine primordiale', 'École du savoir', 'École de la guerre', 'Inébranlable', 'Syndicat', 'Troubadour', 'Vengeance', 'Gardien du renouveau', 'Gardien des éléments', 'Éclaireur', 'Sentinelle ailée', 'Orfèvre des mots']
};
// ids in the expected order, per kind
function idsOf(kind) {
	return kind === 'domains' ? DOMAINS.map(domId) : file(KINDS[kind]).map((e) => e.id);
}
const ALL_KINDS = [...Object.keys(KINDS), 'domains'];

test('the overlay files have one non-empty French name per element id of every kind (612)', () => {
	const fr = frNames();
	let n = 0;
	for (const kind of ALL_KINDS) {
		for (const id of idsOf(kind)) {
			n++;
			assert.equal(typeof fr[id], 'string', `${id} missing`);
			assert.ok(fr[id].trim().length > 0, `${id} empty`);
		}
	}
	assert.equal(n, 612);
	assert.equal(frFiles().reduce((total, d) => total + Object.values(d).filter(hasName).length, 0), 612);
});

test('overlay files: classes, domains, ancestries, communities and subclasses have the fixed French names', () => {
	const fr = frNames();
	for (const [kind, names] of Object.entries(FIXED)) {
		const ids = idsOf(kind);
		assert.equal(ids.length, names.length, kind);
		ids.forEach((id, i) => assert.equal(fr[id], names[i], id));
	}
});

const DOMAIN_TEXTS = {
	Arcana: ['Raw, innate magic: elemental and unstable power.', 'Magie brute et innée : puissance élémentaire et instable.'],
	Blade: ['Weapon mastery and martial prowess.', 'Maîtrise des armes et prouesse martiale.'],
	Bone: ['Swiftness, tactics and command of the body.', 'Vivacité, tactique et maîtrise du corps.'],
	Codex: ['Studied magic from books and formulas.', 'Magie étudiée dans les livres et les formules.'],
	Grace: ['Charisma, persuasion and enchantment.', 'Charisme, persuasion et enchantement.'],
	Midnight: ['Shadows, secrecy and stealth.', 'Ombres, secrets et discrétion.'],
	Sage: ['The natural world, its creatures and growth.', 'La nature, ses créatures et sa croissance.'],
	Splendor: ['Life, healing and divine light.', 'La vie, les soins et la lumière divine.'],
	Valor: ['Protection, endurance and courage.', 'Protection, endurance et courage.']
};
// Accepts an object keyed by id, or an array of {id,...}.
function entry(data, id) {
	if (Array.isArray(data)) return data.find((x) => x.id === id);
	return data[id];
}

test('domains.json gives each of the 9 domains its en and fr helper text', () => {
	const data = readJson(`${DIR}/domains.json`);
	for (const [name, [en, fr]] of Object.entries(DOMAIN_TEXTS)) {
		const e = entry(data, domId(name)) ?? entry(data, name.toLowerCase()) ?? entry(data, name);
		assert.ok(e, `${name} missing`);
		assert.equal(e.en, en, name);
		assert.equal(e.fr, fr, name);
	}
});

const GLOSSARY = {
	hp: ['Hit Points. Damage marks HP; when every HP is marked, the character is Down.', 'Points de vie. Les dégâts marquent des PV ; quand tous sont marqués, le personnage est à terre.'],
	stress: ['Stress marks strain. When every Stress is marked, more Stress marks an HP instead and the character becomes Vulnerable.', 'Le Stress marque la tension. Quand tout le Stress est marqué, le Stress suivant marque un PV et le personnage devient Vulnérable.'],
	hope: ['Hope (0 to 6) is gained when the Hope die rolls higher, and spent on Hope features, Experiences and helping allies.', "L'Espoir (0 à 6) se gagne quand le dé d'Espoir fait plus, et se dépense pour les capacités d'Espoir, les Expériences et aider ses alliés."],
	fear: ["Fear (0 to 12) is the GM's resource, gained when a player rolls with Fear and spent to make GM moves.", "La Peur (0 à 12) est la ressource du MJ : il la gagne quand un joueur obtient un jet avec Peur et la dépense pour ses actions."],
	armor: ['Mark an Armor slot to lower the severity of an incoming hit by one threshold.', "Marquez un emplacement d'Armure pour réduire d'un seuil la gravité d'une attaque reçue."],
	evasion: ['Evasion is the Difficulty of attack rolls made against the character.', "L'Évasion est la Difficulté des jets d'attaque contre le personnage."],
	thresholds: ['Damage below Major marks 1 HP, from Major 2 HP, from Severe 3 HP.', 'Des dégâts sous le seuil Majeur marquent 1 PV, à partir de Majeur 2 PV, à partir de Grave 3 PV.'],
	vulnerable: ['Vulnerable: rolls against the character have advantage.', "Vulnérable : les jets contre le personnage ont l'avantage."],
	restrained: ['Restrained: the character cannot move, but can still act.', 'Entravé : le personnage ne peut pas se déplacer, mais peut agir.'],
	hidden: ['Hidden: rolls against the character have disadvantage until they are seen.', "Caché : les jets contre le personnage ont le désavantage tant qu'il n'est pas vu."],
	gold: ['10 handfuls make a bag, 10 bags make a chest.', '10 poignées font une bourse, 10 bourses font un coffre.'],
	level: ['Level 1 to 10: tier 1 is level 1, tier 2 levels 2–4, tier 3 levels 5–7, tier 4 levels 8–10.', 'Niveau 1 à 10 : palier 1 au niveau 1, palier 2 aux niveaux 2–4, palier 3 aux niveaux 5–7, palier 4 aux niveaux 8–10.']
};

test('glossary.json has the 12 terms with their en and fr texts', () => {
	const data = readJson(`${DIR}/glossary.json`);
	for (const [id, [en, fr]] of Object.entries(GLOSSARY)) {
		const e = entry(data, id);
		assert.ok(e, `${id} missing`);
		assert.equal(e.en, en, id);
		assert.equal(e.fr, fr, id);
	}
	const count = Array.isArray(data) ? data.length : Object.keys(data).length;
	assert.equal(count, 12);
});

test('GET /api/srd/<kind> in French returns French names in file order; English and default stay English', async () => {
	const fr = frNames();
	for (const kind of ALL_KINDS) {
		const ids = idsOf(kind);
		const r = await get(`/api/srd/${kind}`, 'fr');
		assert.equal(r.status, 200, kind);
		assert.deepEqual(await r.json(), ids.map((id) => ({ id, name: fr[id], nameLang: 'fr' })), kind); // us-209 adds nameLang
		const enList = await (await get(`/api/srd/${kind}`, 'en')).json();
		assert.deepEqual(enList.map((x) => x.id), ids, kind);
		if (kind in FIXED) assert.notDeepEqual(enList.map((x) => x.name), FIXED[kind], `${kind} en must stay English`);
	}
	const classes = await (await get('/api/srd/classes', 'fr')).json();
	assert.deepEqual(classes.map((c) => c.name), FIXED.classes);
	const def = await (await get('/api/srd/classes')).json();
	assert.equal(def[0].name, 'Bard');
});

test('GET /api/srd/<kind>/<id> in French returns the file object unchanged plus the French nameLocalized', async () => {
	const fr = frNames();
	for (const [kind, f] of Object.entries(KINDS)) {
		const els = file(f);
		for (const e of [els[0], els[els.length - 1]]) {
			const r = await get(`/api/srd/${kind}/${e.id}`, 'fr');
			assert.equal(r.status, 200);
			// us-209: the French name is merged into `name` too (plain string for classes, {"en-US": fr} for core kinds)
			const body = await r.json();
			const expected = { ...e, name: typeof e.name === 'string' ? fr[e.id] : { 'en-US': fr[e.id] }, nameLocalized: fr[e.id] };
			// us-218, us-219: cards of the nine translated domains have French features; compare the rest
			if (kind === 'domain-cards' && ['CODEX', 'SAGE', 'MIDNIGHT', 'BLADE', 'ARCANA', 'SPLENDOR', 'GRACE', 'BONE', 'VALOR'].includes(String(e.domain).toUpperCase())) {
				delete body.features;
				delete expected.features;
			}
			assert.deepEqual(body, expected);
			const en = await (await get(`/api/srd/${kind}/${e.id}`, 'en')).json();
			assert.deepEqual(en, { ...e, nameLocalized: enName(kind, e) });
		}
	}
	const d = await (await get('/api/srd/domains/core_domain_blade', 'fr')).json();
	assert.equal(d.id, 'core_domain_blade');
	assert.equal(d.nameLocalized, 'Lame');
	const dEn = await (await get('/api/srd/domains/core_domain_blade', 'en')).json();
	assert.equal(dEn.nameLocalized, 'Blade');
});

test('unknown kind or element in French -> 404 with {"error"}', async () => {
	for (const p of ['/api/srd/nonsense', '/api/srd/nonsense/core_class_bard', '/api/srd/classes/core_nope', '/api/srd/domains/core_domain_nope']) {
		const r = await get(p, 'fr');
		assert.equal(r.status, 404, p);
		assert.ok('error' in (await r.json()), p);
	}
});
