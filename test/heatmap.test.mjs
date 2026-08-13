import { strict as assert } from 'node:assert';
import { buildTooltip, summarizeSelectedDays } from '../src/heatmap.ts';

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

assert.deepEqual(
	summarizeSelectedDays([54, 30, 0, 25]),
	{ totalMinutes: 109, averageMinutes: 27 },
	'selection total should include every day and average across selected calendar days',
);
assert.deepEqual(summarizeSelectedDays([]), { totalMinutes: 0, averageMinutes: 0 });
