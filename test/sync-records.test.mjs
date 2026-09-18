import assert from 'node:assert/strict';
import { parseCompletionSyncRecord, parseSessionSyncRecord } from '../src/sync-records.ts';
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

assert.throws(() => parseSessionSyncRecord('{"id":"incomplete"}'), /Invalid session/);
assert.throws(() => parseCompletionSyncRecord('{"dateStr":"2026-09-18"}'), /Invalid completion/);
