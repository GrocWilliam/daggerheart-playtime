// Pure sheet tab map: no imports, shared by +page.server.ts and +page.svelte.
export const SHEET_TABS = ['play', 'traits', 'gear', 'cards', 'notes'] as const;
export type SheetTab = (typeof SHEET_TABS)[number];

export const parseTab = (v: string | null): SheetTab => (SHEET_TABS as readonly string[]).includes(v ?? '') ? (v as SheetTab) : 'play';

export const TAB_LABEL: Record<SheetTab, string> = {
	play: 'tab.play',
	traits: 'section.traits',
	gear: 'tab.gear',
	cards: 'tab.cards',
	notes: 'section.notes'
};

export type ActionName =
	| 'tracker' | 'damage' | 'condition'
	| 'setExperience' | 'addExperience' | 'removeExperience'
	| 'equip' | 'gold' | 'addItem' | 'setQuantity' | 'removeItem'
	| 'addCard' | 'removeCard' | 'notes' | 'edit';

/** The tab an action returns to; null keeps the current one. */
export const ACTION_TAB: Record<ActionName, SheetTab | null> = {
	tracker: 'play', damage: 'play', condition: 'play',
	setExperience: 'traits', addExperience: 'traits', removeExperience: 'traits',
	equip: 'gear', gold: 'gear', addItem: 'gear', setQuantity: 'gear', removeItem: 'gear',
	addCard: 'cards', removeCard: 'cards',
	notes: 'notes',
	edit: null
};

/** The `sheet-*` test id where an action's error shows; null for actions behind a modal. */
export const ACTION_SECTION: Record<ActionName, string | null> = {
	tracker: 'sheet-trackers', damage: 'sheet-trackers',
	condition: 'sheet-conditions',
	setExperience: 'sheet-experiences', removeExperience: 'sheet-experiences',
	equip: 'sheet-equipment',
	gold: 'sheet-gold',
	setQuantity: 'sheet-inventory', removeItem: 'sheet-inventory',
	removeCard: 'sheet-cards',
	notes: 'sheet-notes',
	edit: null, addItem: null, addExperience: null, addCard: null
};

export const actionHref = (name: ActionName, current: SheetTab): string => `?/${name}&tab=${ACTION_TAB[name] ?? current}`;
