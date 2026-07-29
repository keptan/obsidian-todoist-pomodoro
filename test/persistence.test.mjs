import { SerializedSaveQueue } from '../src/persistence.ts';

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
