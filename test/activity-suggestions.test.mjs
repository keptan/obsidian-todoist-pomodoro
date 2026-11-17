import { strict as assert } from 'node:assert';
import { activityKey, buildActivitySuggestions, mergeActivityRecency } from '../src/activity-suggestions.ts';

const tasks = [
	{ id: 'new', content: 'Untracked task' },
	{ id: 'old', content: 'Older task' },
	{ id: 'recent', content: 'Recent task' },
	{ id: 'done', content: 'Completed task', checked: true },
	{ id: 'also-done', content: 'Also completed', completed_at: '2026-11-18' },
];
const sessions = [
	{ taskId: 'old', taskContent: 'Older task', endTime: 100 },
	{ taskId: 'recent', taskContent: 'Recent task', endTime: 300 },
	{ taskId: 'custom:Reading:1', taskContent: 'Reading', endTime: 200 },
	{ taskId: 'custom:Reading:2', taskContent: 'Reading', endTime: 400 },
	{ taskId: 'custom:Recovered', taskContent: 'Recovered', endTime: 150 },
	{ taskId: 'done', taskContent: 'Completed task', endTime: 900 },
];
const suggestions = buildActivitySuggestions(tasks, ['Reading', 'reading', 'Untracked custom'], sessions, { 'todoist:old': 500 });
assert.deepEqual(suggestions.slice(0, 4).map(s => s.label), ['Older task', 'Reading', 'Recent task', 'Recovered'], 'mix activities and open tasks by most recent tracking time, including just-started tasks');
assert.equal(suggestions.filter(s => s.key === 'custom:reading').length, 1, 'collapse custom activity names across session IDs and capitalization');
assert.ok(!suggestions.some(s => s.key === 'todoist:done' || s.key === 'todoist:also-done'), 'exclude completed Todoist tasks even when recently tracked');
assert.ok(suggestions.some(s => s.key === 'todoist:new'), 'include untracked active tasks after tracked activities');
assert.equal(activityKey({ id: 'custom:Reading:999', content: ' Reading ' }), 'custom:reading');
assert.deepEqual(mergeActivityRecency({ a: 100, b: 300 }, { a: 200, b: 50, c: 400, invalid: 'bad', infinite: Infinity }), { a: 200, b: 300, c: 400 });
assert.deepEqual(buildActivitySuggestions([], [], [], {}), []);
