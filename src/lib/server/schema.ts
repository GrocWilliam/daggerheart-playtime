import { sql } from 'drizzle-orm';
import {
	bigserial,
	boolean,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';

// Mirrors migrations/001-006 (the legacy, frozen SQL migrations).

export const appInfo = pgTable('app_info', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

export const campaigns = pgTable('campaigns', {
	id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
	name: text('name').notNull(),
	fear: integer('fear').notNull().default(0),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	seq: bigserial('seq', { mode: 'number' })
});

export const characters = pgTable('characters', {
	id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
	campaignId: text('campaign_id')
		.notNull()
		.references(() => campaigns.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	class: text('class').notNull(),
	level: integer('level').notNull().default(1),
	evasion: integer('evasion').notNull(),
	majorThreshold: integer('major_threshold').notNull(),
	severeThreshold: integer('severe_threshold').notNull(),
	hpMarked: integer('hp_marked').notNull().default(0),
	hpMax: integer('hp_max').notNull(),
	stressMarked: integer('stress_marked').notNull().default(0),
	stressMax: integer('stress_max').notNull().default(6),
	hope: integer('hope').notNull().default(2),
	armorMarked: integer('armor_marked').notNull().default(0),
	armorMax: integer('armor_max').notNull().default(0),
	vulnerable: boolean('vulnerable').notNull().default(false),
	restrained: boolean('restrained').notNull().default(false),
	hidden: boolean('hidden').notNull().default(false),
	notes: text('notes').notNull().default(''),
	goldHandfuls: integer('gold_handfuls').notNull().default(0),
	goldBags: integer('gold_bags').notNull().default(0),
	goldChests: integer('gold_chests').notNull().default(0),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	seq: bigserial('seq', { mode: 'number' }),
	subclass: text('subclass'),
	ancestry: text('ancestry'),
	community: text('community'),
	cards: jsonb('cards').notNull().default(sql`'[]'::jsonb`),
	agility: integer('agility').notNull().default(0),
	strength: integer('strength').notNull().default(0),
	finesse: integer('finesse').notNull().default(0),
	instinct: integer('instinct').notNull().default(0),
	presence: integer('presence').notNull().default(0),
	knowledge: integer('knowledge').notNull().default(0),
	primaryWeapon: text('primary_weapon'),
	secondaryWeapon: text('secondary_weapon'),
	armorId: text('armor_id')
});

export const items = pgTable(
	'items',
	{
		id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
		characterId: text('character_id')
			.notNull()
			.references(() => characters.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		quantity: integer('quantity').notNull().default(1),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		srdId: text('srd_id')
	},
	(t) => [uniqueIndex('items_character_name_uniq').on(t.characterId, sql`lower(btrim(${t.name}))`)]
);

export const experiences = pgTable(
	'experiences',
	{
		id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
		characterId: text('character_id')
			.notNull()
			.references(() => characters.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		modifier: integer('modifier').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		seq: bigserial('seq', { mode: 'number' })
	},
	(t) => [uniqueIndex('experiences_character_name_uniq').on(t.characterId, sql`lower(btrim(${t.name}))`)]
);

export const scenes = pgTable('scenes', {
	id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
	campaignId: text('campaign_id')
		.notNull()
		.references(() => campaigns.id, { onDelete: 'cascade' }),
	position: integer('position').notNull(),
	title: text('title').notNull(),
	notes: text('notes').notNull().default(''),
	environmentId: text('environment_id'),
	status: text('status').notNull().default('planned'),
	encounter: jsonb('encounter'),
	loot: jsonb('loot').notNull().default(sql`'[]'::jsonb`)
});

export const journalEntries = pgTable('journal_entries', {
	id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
	campaignId: text('campaign_id')
		.notNull()
		.references(() => campaigns.id, { onDelete: 'cascade' }),
	text: text('text').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
