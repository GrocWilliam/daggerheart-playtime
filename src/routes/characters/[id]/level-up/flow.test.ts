import { describe, expect, it } from 'vitest';
import { fieldOfMessage, levelUpBody, levelUpHref, parseStep, readValues, stepOfField } from './flow';

describe('flow', () => {
	it('parses steps', () => {
		expect(parseStep('5')).toBe(5);
		expect(parseStep('6')).toBe(1);
	});
	it('builds a body', () => {
		const v = readValues(new URLSearchParams('pick1=proficiency&domainCard=c1'));
		expect(levelUpBody(v)).toEqual({ advancements: [{ option: 'proficiency' }], domainCard: 'c1' });
	});
	it('maps fields and messages', () => {
		expect(stepOfField('p2card')).toBe(3);
		expect(fieldOfMessage('cardId is not an eligible card')).toBe('p1card');
	});
	it('builds hrefs', () => {
		expect(levelUpHref('x', 2, { pick1: 'hp' }, 'pick2')).toBe('/characters/x/level-up?step=2&pick1=hp&invalid=pick2');
	});
});
