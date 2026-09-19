import assert from 'node:assert/strict';
import { parseCompletionSyncRecord, parseSessionSyncRecord, parseWorkoutSyncRecord } from '../src/sync-records.ts';
import { formatLocalDate, getSessionDateKey } from '../src/utils.ts';

const session = parseSessionSyncRecord(JSON.stringify({
	id: 'manual-device-a',
	taskId: 'custom:Writing',
	taskContent: 'Writing',
	startTime: Date.parse('2026-09-19T01:00:00Z'),
	endTime: Date.parse('2026-09-19T01:30:00Z'),
	durationMinutes: 30,
	completed: false,
	dateKey: '2026-09-18',
}));

assert.equal(session.id, 'manual-device-a');
assert.equal(getSessionDateKey(session), '2026-09-18');

const legacySession = { ...session, dateKey: undefined };
assert.equal(getSessionDateKey(legacySession), formatLocalDate(legacySession.startTime));

const completion = parseCompletionSyncRecord(JSON.stringify({
	dateStr: '2026-09-18',
	taskId: 'todoist-task',
	taskContent: 'Ship it',
	timestamp: Date.parse('2026-09-18T16:00:00Z'),
}));
assert.equal(completion.dateStr, '2026-09-18');

const workout = parseWorkoutSyncRecord(JSON.stringify({
	id: 'workout-device-a',
	dateKey: '2026-09-18',
	timestamp: Date.parse('2026-09-18T17:00:00Z'),
	pushUps: 30,
	pullUps: 5,
	dips: 4,
}));
assert.equal(workout.pushUps, 30);
assert.equal(workout.pullUps, 5);
assert.equal(workout.dips, 4);

const legacyWorkout = parseWorkoutSyncRecord(JSON.stringify({
	id: 'workout-device-b',
	dateKey: '2026-09-18',
	timestamp: Date.parse('2026-09-18T18:00:00Z'),
	pushUps: 10,
	pullUps: 0,
}));
assert.equal(legacyWorkout.dips, undefined);

const dipsOnlyWorkout = parseWorkoutSyncRecord(JSON.stringify({
	id: 'workout-device-c',
	dateKey: '2026-09-18',
	timestamp: Date.parse('2026-09-18T19:00:00Z'),
	pushUps: 0,
	pullUps: 0,
	dips: 10,
}));
assert.equal(dipsOnlyWorkout.dips, 10);

assert.throws(() => parseSessionSyncRecord('{"id":"incomplete"}'), /Invalid session/);
assert.throws(() => parseCompletionSyncRecord('{"dateStr":"2026-09-18"}'), /Invalid completion/);
assert.throws(() => parseWorkoutSyncRecord('{"id":"workout","dateKey":"2026-09-18","timestamp":1,"pushUps":0,"pullUps":0}'), /Invalid workout/);
assert.throws(() => parseWorkoutSyncRecord('{"id":"workout","dateKey":"2026-09-18","timestamp":1,"pushUps":2.5,"pullUps":0}'), /Invalid workout/);
assert.throws(() => parseWorkoutSyncRecord('{"id":"workout","dateKey":"2026-09-18","timestamp":1,"pushUps":0,"pullUps":0,"dips":-1}'), /Invalid workout/);
