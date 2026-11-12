import { describe, expect, it } from 'vitest';
import { subclassStage } from '../../../src/lib/server/features/characters';

const adv = (option: string, level = 2) => ({ level, tier: 2, option }) as any;

describe('subclassStage', () => {
	it('is null with no advancements', () => {
		expect(subclassStage([])).toBeNull();
	});
	it('is null when no entry is a subclass one', () => {
		expect(subclassStage([adv('hp'), adv('traits', 3)])).toBeNull();
	});
	it("is 'specialization' with one subclass entry among others", () => {
		expect(subclassStage([adv('hp'), adv('subclass', 5), adv('evasion', 6)])).toBe('specialization');
	});
	it("is 'mastery' with two subclass entries", () => {
		expect(subclassStage([adv('subclass', 5), adv('hp', 6), adv('subclass', 8)])).toBe('mastery');
	});
	it("stays 'mastery' with more than two", () => {
		expect(subclassStage([adv('subclass', 5), adv('subclass', 8), adv('subclass', 9)])).toBe('mastery');
	});
});
