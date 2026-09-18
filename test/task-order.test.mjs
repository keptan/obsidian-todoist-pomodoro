import { strict as assert } from 'node:assert';
import { reorderTaskIds, sortTasksByViewOrder, updateStoredTaskOrder } from '../src/task-order.ts';

const tasks = [
	{ id: 'low', content: 'Low', project_id: 'p', priority: 1 },
	{ id: 'urgent', content: 'Urgent', project_id: 'p', priority: 4 },
	{ id: 'middle', content: 'Middle', project_id: 'p', priority: 2 },
];

assert.deepEqual(
	sortTasksByViewOrder(tasks, []).map(task => task.id),
	['urgent', 'middle', 'low'],
	'tasks without a saved order should retain the existing priority sort',
);

assert.deepEqual(
	sortTasksByViewOrder(tasks, ['low', 'urgent', 'middle']).map(task => task.id),
	['low', 'urgent', 'middle'],
	'saved view order should take precedence over task metadata',
);

assert.deepEqual(
	reorderTaskIds(['a', 'b', 'c', 'd'], 'd', 'b', 'before'),
	['a', 'd', 'b', 'c'],
);
assert.deepEqual(
	reorderTaskIds(['a', 'b', 'c', 'd'], 'a', 'c', 'after'),
	['b', 'c', 'a', 'd'],
);
assert.deepEqual(
	reorderTaskIds(['a', 'b'], 'missing', 'a', 'before'),
	['a', 'b'],
	'unknown task IDs should leave the order unchanged',
);

assert.deepEqual(
	updateStoredTaskOrder(['other-2', 'b', 'other-1', 'a'], ['a', 'c', 'b']),
	['other-2', 'other-1', 'a', 'c', 'b'],
	'reordering one sibling list should preserve ordering data for other lists',
);
