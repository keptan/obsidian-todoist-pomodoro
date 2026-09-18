import assert from 'node:assert/strict';
import {
	getDateRangesToSync,
	getUncoveredDateRanges,
	mergeDateRanges,
	SerializedSaveQueue,
} from '../src/persistence.ts';

const queue = new SerializedSaveQueue();
const writes = [];

const first = queue.enqueue(async () => {
	await new Promise(resolve => setTimeout(resolve, 10));
	writes.push('first');
});
const second = queue.enqueue(async () => {
	writes.push('second');
});

if (!queue.hasPending) throw new Error('Queue should report pending writes');
await Promise.all([first, second]);
if (writes.join(',') !== 'first,second') throw new Error('Writes were not serialized');
if (queue.hasPending) throw new Error('Queue should be empty after writes complete');

await queue.enqueue(async () => {
	throw new Error('expected failure');
}).catch(() => undefined);
await queue.enqueue(async () => {
	writes.push('after-failure');
});
await queue.drain();

if (writes.at(-1) !== 'after-failure') {
	throw new Error('A failed write poisoned the save queue');
}

assert.deepEqual(
	mergeDateRanges([
		{ start: '2026-02-01', end: '2026-03-01' },
		{ start: '2026-01-01', end: '2026-02-01' },
		{ start: '2026-04-01', end: '2026-05-01' },
	]),
	[
		{ start: '2026-01-01', end: '2026-03-01' },
		{ start: '2026-04-01', end: '2026-05-01' },
	],
);

assert.deepEqual(
	getUncoveredDateRanges(
		{ start: '2026-01-01', end: '2026-06-01' },
		[
			{ start: '2025-12-01', end: '2026-02-01' },
			{ start: '2026-03-01', end: '2026-05-01' },
		],
	),
	[
		{ start: '2026-02-01', end: '2026-03-01' },
		{ start: '2026-05-01', end: '2026-06-01' },
	],
);

assert.deepEqual(
	getDateRangesToSync(
		{ start: '2026-01-01', end: '2026-09-19' },
		[{ start: '2026-01-01', end: '2026-09-19' }],
		'2026-09-16',
	),
	[{ start: '2026-09-16', end: '2026-09-19' }],
);

assert.deepEqual(
	getDateRangesToSync(
		{ start: '2025-01-01', end: '2025-02-01' },
		[{ start: '2025-01-01', end: '2025-02-01' }],
		'2026-09-16',
	),
	[],
);
