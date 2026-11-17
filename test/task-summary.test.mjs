import { strict as assert } from 'node:assert';
import { TaskHistory } from '../src/task-summary.ts';
import { formatTaskTime, renderTaskSummaryBadges } from '../src/ui/task-summary-badges.ts';

const task = (id, parent_id = null, project_id = 'work') => ({ id, parent_id, project_id, content: id, priority: 1 });
const session = (taskId, durationMinutes, completed = true) => ({ id: `s-${taskId}`, taskId, durationMinutes, completed });
const parent = task('parent');
const child = task('child', 'parent');
const done = task('done', 'parent');
const history = new TaskHistory();
history.remember([parent, child, done], 100);
const sessions = [session('parent', 60), session('child', 60, false), session('done', 60)];
let summary = history.summarize([parent, child], sessions);
assert.deepEqual(summary.byTask.get('parent'), { count: 1, activeMinutes: 120, totalMinutes: 180 }, '1h own + 1h active child + 1h completed child = 2h active / 3h total');
assert.deepEqual(summary.byProject.get('work'), { count: 2, activeMinutes: 120, totalMinutes: 180 }, 'project totals count each session once');
assert.deepEqual(summary.byTask.get('child'), { count: 0, activeMinutes: 60, totalMinutes: 60 }, 'a partial pomodoro still counts when its task is active');

const restored = new TaskHistory(JSON.parse(JSON.stringify(history.serialize())));
summary = restored.summarize([parent], sessions);
assert.deepEqual(summary.byTask.get('parent'), { count: 0, activeMinutes: 60, totalMinutes: 180 }, 'completed child time survives reload');
assert.deepEqual(restored.summarize([], sessions).byProject.get('work'), { count: 0, activeMinutes: 0, totalMinutes: 180 });

const grandchild = task('nested', 'child');
history.remember([grandchild], 101);
summary = history.summarize([grandchild, child, parent], [...sessions, session('nested', 30)]);
assert.deepEqual(summary.byTask.get('parent'), { count: 2, activeMinutes: 150, totalMinutes: 210 });
assert.deepEqual(summary.byTask.get('child'), { count: 1, activeMinutes: 90, totalMinutes: 90 });
assert.deepEqual(summary.byProject.get('work'), { count: 3, activeMinutes: 150, totalMinutes: 210 });
assert.equal(summary.byProject.get('work').totalMinutes, summary.byTask.get('parent').totalMinutes, 'nested rollups must not double count');
assert.equal(history.summarize([parent, { ...child, checked: true }], sessions).byTask.get('parent').activeMinutes, 60);

// A completed-history import recovers ancestry that was never cached as active.
const imported = new TaskHistory();
imported.remember([done], 100);
assert.equal(imported.summarize([parent], sessions).byTask.get('parent').totalMinutes, 120);
const moved = task('done', null, 'other');
imported.remember([moved], 200);
imported.remember([done], 100);
assert.equal(imported.summarize([parent], sessions).byTask.get('parent').totalMinutes, 60, 'old history cannot move a task back to its previous parent');
assert.equal(imported.summarize([parent], sessions).byProject.get('other').totalMinutes, 60);
assert.equal(imported.merge(history.serialize()), true, 'merge task links recorded on another device');
assert.equal(imported.serialize().done.projectId, 'other', 'newer local links survive stale disk data');
assert.equal(imported.merge({ bad: { parentId: 5 }, invalid: null }), false);

const cyclic = new TaskHistory();
cyclic.remember([task('a', 'b'), task('b', 'a')]);
assert.equal(cyclic.summarize([task('a', 'b'), task('b', 'a')], [session('a', 10)]).byTask.get('a').totalMinutes, 10, 'corrupt cycles do not loop or count a session twice');

assert.equal(formatTaskTime(120), '2h');
assert.equal(formatTaskTime(180), '3h');
assert.equal(formatTaskTime(90), '1h 30m');
assert.equal(formatTaskTime(0), '0m');

const children = [];
const container = { createSpan: options => {
	assert.equal(options.cls, 'mikumodoro-task-badges');
	return { createSpan: badge => children.push(badge) };
} };
const date = { task: child, date: '2026-11-17', source: 'date', daysAway: 0 };
renderTaskSummaryBadges(container, date, { count: 1, activeMinutes: 120, totalMinutes: 180 });
assert.deepEqual(children.map(b => b.text), ['❗', '1', '3h'], 'render due date, count, and total time in order');
assert.match(children[2].attr.title, /including completed/);
children.length = 0;
renderTaskSummaryBadges(container, null, { count: 0, activeMinutes: 0, totalMinutes: 60 });
assert.deepEqual(children.map(b => b.text), ['1h'], 'retain total time when only completed children have time');
children.length = 0;
renderTaskSummaryBadges(container, null, { count: 0, activeMinutes: 0, totalMinutes: 0 });
assert.equal(children.length, 0, 'omit empty counts and times');
