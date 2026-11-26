import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encounterWith, storedCounts, postSetCount } from '../support/encounters.mjs';

const BASE = process.env.BASE_URL;
const ok = (status) => assert.ok(status === 200 || status === 303, `status ${status}`);

test('setCount with target and delta +1 at count 20 keeps 20', async () => {
	const { campaignId, sceneId, ids } = await encounterWith(BASE, [20]);
	ok(await postSetCount(BASE, campaignId, sceneId, [[ids[0], 20]], { target: ids[0], delta: 1 }));
	assert.equal((await storedCounts(BASE, campaignId, sceneId))[ids[0]], 20);
});

test('setCount with target and delta -1 at count 1 keeps 1', async () => {
	const { campaignId, sceneId, ids } = await encounterWith(BASE, [1]);
	ok(await postSetCount(BASE, campaignId, sceneId, [[ids[0], 1]], { target: ids[0], delta: -1 }));
	assert.equal((await storedCounts(BASE, campaignId, sceneId))[ids[0]], 1);
});

test('setCount with delta -1 at a stored count of 30 stores 29', async () => {
	const { campaignId, sceneId, ids } = await encounterWith(BASE, [30]);
	ok(await postSetCount(BASE, campaignId, sceneId, [[ids[0], 30]], { target: ids[0], delta: -1 }));
	assert.equal((await storedCounts(BASE, campaignId, sceneId))[ids[0]], 29);
});

test('setCount with delta changes only the target, the other counts stay', async () => {
	const { campaignId, sceneId, ids } = await encounterWith(BASE, [3, 2]);
	ok(await postSetCount(BASE, campaignId, sceneId, [[ids[0], 3], [ids[1], 2]], { target: ids[1], delta: 1 }));
	const c = await storedCounts(BASE, campaignId, sceneId);
	assert.equal(c[ids[0]], 3);
	assert.equal(c[ids[1]], 3);
});

test('setCount without target and delta saves the counts as sent', async () => {
	const { campaignId, sceneId, ids } = await encounterWith(BASE, [3, 2]);
	ok(await postSetCount(BASE, campaignId, sceneId, [[ids[0], 7], [ids[1], 5]]));
	const c = await storedCounts(BASE, campaignId, sceneId);
	assert.equal(c[ids[0]], 7);
	assert.equal(c[ids[1]], 5);
});
