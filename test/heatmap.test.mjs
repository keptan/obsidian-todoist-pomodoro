import { strict as assert } from 'node:assert';
import { buildTooltip, formatSelectionSummary, summarizeSelectedDays } from '../src/heatmap.ts';
import { formatLocalDate, rollingYearWindow } from '../src/utils.ts';

const rolling = rollingYearWindow(2026, new Date(2026, 7, 14));
assert.equal(formatLocalDate(rolling.start), '2025-08-14');
assert.equal(formatLocalDate(rolling.end), '2026-08-14');

const leapRolling = rollingYearWindow(2025, new Date(2024, 1, 29));
assert.equal(formatLocalDate(leapRolling.start), '2024-02-29');
assert.equal(formatLocalDate(leapRolling.end), '2025-02-28');

const taskEntries = [
	{ taskContent: 'smallest', minutes: 5 },
	{ taskContent: 'largest', minutes: 60 },
	{ taskContent: 'second', minutes: 30 },
	{ taskContent: 'third', minutes: 25 },
	{ taskContent: 'fourth', minutes: 20 },
	{ taskContent: 'fifth', minutes: 14 },
];

const tooltip = buildTooltip(
	'2026-08-12',
	new Date(2026, 7, 12),
	154,
	0,
	false,
	[],
	new Map([['2026-08-12', taskEntries]]),
);
const lines = tooltip.split('\n');

assert.equal(lines[0], 'Aug 12: 2h 34m total');
assert.match(lines[1], /largest: 1h$/);
assert.match(lines[5], /fifth: 14m$/);
assert.equal(lines[6], '  and 1 more');
assert.doesNotMatch(tooltip, /smallest: 5m/);

const completionTooltip = buildTooltip(
	'2026-08-12',
	new Date(2026, 7, 12),
	0,
	3,
	false,
	[],
	new Map(),
);
assert.match(completionTooltip, /3 Todoist tasks completed/);

const selection = summarizeSelectedDays([
	{ minutes: 54, completions: 2, tasks: [{ taskContent: 'Writing', minutes: 54 }] },
	{ minutes: 30, completions: 1, tasks: [{ taskContent: 'Math', minutes: 30 }] },
	{ minutes: 0, completions: 0, tasks: [] },
	{ minutes: 25, completions: 3, tasks: [{ taskContent: 'Writing', minutes: 25 }] },
]);
assert.equal(selection.totalMinutes, 109);
assert.equal(selection.averageMinutes, 27);
assert.equal(selection.completions, 6);
assert.deepEqual(selection.tasks, [
	{ taskContent: 'Writing', minutes: 79 },
	{ taskContent: 'Math', minutes: 30 },
]);
assert.equal(
	formatSelectionSummary(selection),
	'1h 49m total · 27m/day\nWriting: 1h 19m\nMath: 30m\n6 Todoist tasks completed',
);
