import { describe, expect, it } from 'vitest';
import { TRACKERS, trackerValues } from './trackers';

describe('trackerValues', () => {
	it('shows Hope as a number out of 6', () => {
		expect(trackerValues(2)).toEqual({ value: '2', filled: 2, max: 6 });
	});
	it('shows marked/max for the other trackers', () => {
		expect(trackerValues({ marked: 1, max: 6 })).toEqual({ value: '1/6', filled: 1, max: 6 });
	});
	it('lists the four trackers in order', () => {
		expect(TRACKERS).toEqual(['hp', 'stress', 'hope', 'armor']);
	});
});
