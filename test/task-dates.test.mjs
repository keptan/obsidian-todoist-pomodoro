import { strict as assert } from 'node:assert';
import { buildTaskDates, closestTaskDate, taskDateLabel } from '../src/task-dates.ts';
import { groupTasksByProject } from '../src/task-groups.ts';
import { renderTaskDateBadge } from '../src/ui/task-date-badge.ts';

const task = (id, date, extra = {}) => ({
	id, content: id, project_id: 'work', project_name: 'Work', priority: 1,
	...(date ? { due: { date } } : {}), ...extra,
});
const today = new Date(2026, 10, 17, 23, 59);
// Children deliberately precede their parents in Todoist's response.
const tasks = [
	task('nested', '2026-11-19', { parent_id: 'child' }),
	task('later', '2026-11-30', { parent_id: 'parent' }),
	task('child', null, { parent_id: 'parent' }),
	task('parent'),
	task('deadline', '2026-11-17', { deadline: { date: '2026-11-25' } }),
	task('done', '2026-11-01', { parent_id: 'parent', checked: true }),
	task('undated'),
];
const dates = buildTaskDates(tasks, today);
assert.equal(dates.get('parent').task.id, 'nested', 'roll up the nearest date at any nesting depth');
assert.equal(dates.get('child').daysAway, 2);
assert.equal(dates.get('parent').daysAway, 2, 'count calendar days even just before midnight');
assert.equal(dates.get('deadline').daysAway, 8, 'deadline replaces the assigned date on that task');
assert.equal(dates.get('deadline').source, 'deadline');
assert.equal(dates.get('undated'), null);
assert.equal(closestTaskDate([]), null);

const { projectGroups } = groupTasksByProject(tasks);
assert.deepEqual(projectGroups.get('work').tasks.map(t => t.id), tasks.map(t => t.id));
assert.equal(closestTaskDate(projectGroups.get('work').tasks.map(t => dates.get(t.id))).task.id, 'nested');
const inbox = [
	task('grandchild', null, { project_name: 'Inbox', parent_id: 'inbox-child' }),
	task('inbox-child', null, { project_name: 'Inbox', parent_id: 'inbox-root' }),
	task('inbox-root', null, { project_name: 'Inbox' }),
];
assert.deepEqual(groupTasksByProject(inbox).standaloneTasks.map(t => t.id), ['inbox-root']);

const cases = buildTaskDates([
	task('today', '2026-11-17'),
	task('overdue', '2026-11-15'),
	task('timestamp', '2026-11-18T00:30:00Z'),
	task('invalid', '2026-02-30'),
	task('invalid-format', 'next week'),
	task('deadline-only', null, { deadline: { date: '2026-11-16' } }),
	task('earlier-deadline', '2026-11-30', { deadline: { date: '2026-11-18' } }),
], today);
assert.equal(cases.get('today').daysAway, 0);
assert.equal(cases.get('overdue').daysAway, -2);
assert.equal(cases.get('timestamp').daysAway, 1, 'use the scheduled calendar date, avoiding UTC midnight shifts');
assert.equal(cases.get('invalid'), null);
assert.equal(cases.get('invalid-format'), null);
assert.equal(cases.get('deadline-only').daysAway, -1);
assert.equal(cases.get('earlier-deadline').daysAway, 1);
assert.match(taskDateLabel(cases.get('today')), /Assigned date today/);
assert.match(taskDateLabel(cases.get('overdue')), /2 days overdue/);
assert.match(taskDateLabel(cases.get('deadline-only')), /Deadline 1 day overdue/);
assert.equal(buildTaskDates(tasks, new Date(2026, 10, 18)).get('parent').daysAway, 1, 'recompute on day rollover');

const originalTZ = process.env.TZ;
try {
	process.env.TZ = 'America/New_York';
	assert.equal(buildTaskDates([task('spring', '2026-03-09')], new Date(2026, 2, 7, 23)).get('spring').daysAway, 2);
	assert.equal(buildTaskDates([task('fall', '2026-11-02')], new Date(2026, 9, 31, 23)).get('fall').daysAway, 2);
} finally {
	if (originalTZ === undefined) delete process.env.TZ;
	else process.env.TZ = originalTZ;
}

const rendered = [];
const container = { createSpan: options => rendered.push(options) };
renderTaskDateBadge(container, dates.get('parent'));
renderTaskDateBadge(container, dates.get('deadline'));
renderTaskDateBadge(container, cases.get('today'));
renderTaskDateBadge(container, cases.get('overdue'));
renderTaskDateBadge(container, null);
assert.deepEqual(rendered.map(badge => badge.text), ['2', '8', '❗', '-2']);
assert.match(rendered[0].attr.title, /nested: Assigned date in 2 days \(2026-11-19\)/);
assert.match(rendered[1].cls, /due-in-7$/);
assert.match(rendered[2].cls, /due-in-0$/);
assert.match(rendered[3].cls, /due-in-0$/);
assert.match(rendered[3].attr['aria-label'], /2 days overdue/);
