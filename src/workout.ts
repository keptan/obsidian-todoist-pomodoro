import type { WorkoutRecord, WorkoutTotals } from './types';

export function getWeightedReps(pushUps: number, pullUps: number, dips = 0): number {
	return pushUps + (pullUps + dips) * 3;
}

export function buildWorkoutMap(records: WorkoutRecord[]): Map<string, WorkoutTotals> {
	const workouts = new Map<string, WorkoutTotals>();
	for (const record of records) {
		const existing = workouts.get(record.dateKey) ?? { pushUps: 0, pullUps: 0, dips: 0, weightedReps: 0 };
		existing.pushUps += record.pushUps;
		existing.pullUps += record.pullUps;
		existing.dips += record.dips ?? 0;
		existing.weightedReps += getWeightedReps(record.pushUps, record.pullUps, record.dips);
		workouts.set(record.dateKey, existing);
	}
	return workouts;
}
