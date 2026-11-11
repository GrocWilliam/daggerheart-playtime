import { describe, expect, it } from 'vitest';
import { firstInvalid } from '../../../src/routes/campaigns/[id]/characters/new/tunnel';

describe('firstInvalid: class must be an SRD class (step 1)', () => {
	it('rejects a non-SRD class at step 1 with { step: 1, field: "class" }', () => {
		expect(firstInvalid({ name: 'Ann', class: 'Pirate', level: '1' }, 2)).toEqual({ step: 1, field: 'class' });
	});

	it('does not stop at step 1 for an SRD class (Warrior)', () => {
		expect(firstInvalid({ name: 'Ann', class: 'Warrior', level: '1' }, 2)).toBeNull();
	});
});
