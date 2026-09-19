import type { CompletionRecord, PomodoroSession, WorkoutRecord } from './types';

export interface CompletionSyncRecord extends CompletionRecord {
	dateStr: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function parseSessionSyncRecord(content: string): PomodoroSession {
	const value: unknown = JSON.parse(content);
	if (
		!isRecord(value)
		|| typeof value.id !== 'string' || value.id.length === 0
		|| typeof value.taskId !== 'string' || value.taskId.length === 0
		|| typeof value.taskContent !== 'string' || value.taskContent.length === 0
		|| typeof value.startTime !== 'number' || !Number.isFinite(value.startTime)
		|| typeof value.endTime !== 'number' || !Number.isFinite(value.endTime) || value.endTime < value.startTime
		|| typeof value.durationMinutes !== 'number' || !Number.isFinite(value.durationMinutes) || value.durationMinutes <= 0
		|| typeof value.completed !== 'boolean'
		|| (value.dateKey !== undefined && (typeof value.dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.dateKey)))
	) {
		throw new Error('Invalid session sync record');
	}
	return value as unknown as PomodoroSession;
}

export function parseCompletionSyncRecord(content: string): CompletionSyncRecord {
	const value: unknown = JSON.parse(content);
	if (
		!isRecord(value)
		|| typeof value.dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.dateStr)
		|| typeof value.taskId !== 'string' || value.taskId.length === 0
		|| typeof value.taskContent !== 'string' || value.taskContent.length === 0
		|| typeof value.timestamp !== 'number' || !Number.isFinite(value.timestamp)
	) {
		throw new Error('Invalid completion sync record');
	}
	return value as unknown as CompletionSyncRecord;
}

export function parseWorkoutSyncRecord(content: string): WorkoutRecord {
	const value: unknown = JSON.parse(content);
	if (
		!isRecord(value)
		|| typeof value.id !== 'string' || value.id.length === 0
		|| typeof value.dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.dateKey)
		|| typeof value.timestamp !== 'number' || !Number.isFinite(value.timestamp)
		|| typeof value.pushUps !== 'number' || !Number.isInteger(value.pushUps) || value.pushUps < 0
		|| typeof value.pullUps !== 'number' || !Number.isInteger(value.pullUps) || value.pullUps < 0
		|| value.pushUps + value.pullUps === 0
	) {
		throw new Error('Invalid workout sync record');
	}
	return value as unknown as WorkoutRecord;
}
