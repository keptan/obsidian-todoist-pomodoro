import { strict as assert } from 'node:assert';
import { removeTaskTree } from '../src/task-cache.ts';

const tasks = [
	{ id: 'parent', content: 'Parent', project_id: 'p', priority: 1 },
	{ id: 'child', content: 'Child', project_id: 'p', parent_id: 'parent', priority: 1 },
	{ id: 'grandchild', content: 'Grandchild', project_id: 'p', parent_id: 'child', priority: 1 },
	{ id: 'sibling', content: 'Sibling', project_id: 'p', priority: 1 },
];

assert.deepEqual(
	removeTaskTree(tasks, 'parent').map(task => task.id),
	['sibling'],
	'completing a parent should remove its full descendant tree',
);

assert.deepEqual(
	removeTaskTree(tasks, 'child').map(task => task.id),
	['parent', 'sibling'],
	'completing a subtask should remove it and its descendants only',
);

assert.equal(tasks.length, 4, 'cache removal should not mutate the original array');
