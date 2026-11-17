import type { MikumodoroSettings, SessionPlan } from './types';

export const MIN_SESSION_MINUTES = 5;
export const MAX_SESSION_MINUTES = 120;

export function defaultSessionPlan(settings: MikumodoroSettings): SessionPlan {
	const work = Number.isFinite(settings.defaultWorkMinutes) && settings.defaultWorkMinutes > 0 ? settings.defaultWorkMinutes : 25;
	const ratio = Number.isFinite(settings.breakRatio) && settings.breakRatio > 0 ? settings.breakRatio : 5;
	const rest = work / ratio;
	const total = Math.min(MAX_SESSION_MINUTES, Math.max(MIN_SESSION_MINUTES, work + rest));
	const workMinutes = Math.min(total - 1, Math.max(1, total * work / (work + rest)));
	return { workMinutes, restMinutes: total - workMinutes };
}

/** Logarithmic duration scale gives short sessions more room for precise adjustment. */
export function totalMinutesAt(position: number): number {
	const fraction = Math.min(1, Math.max(0, position));
	return Math.round(MIN_SESSION_MINUTES * (MAX_SESSION_MINUTES / MIN_SESSION_MINUTES) ** fraction);
}

export function positionForTotal(minutes: number): number {
	return Math.min(1, Math.max(0, Math.log(minutes / MIN_SESSION_MINUTES) / Math.log(MAX_SESSION_MINUTES / MIN_SESSION_MINUTES)));
}

export function splitSessionPlan(total: number, workShare: number): SessionPlan {
	const duration = Math.min(MAX_SESSION_MINUTES, Math.max(MIN_SESSION_MINUTES, total));
	const workMinutes = Math.min(duration - 1, Math.max(1, Math.round(duration * workShare)));
	return { workMinutes, restMinutes: duration - workMinutes };
}

export function validSessionPlan(plan: SessionPlan | undefined): plan is SessionPlan {
	return !!plan && Number.isFinite(plan.workMinutes) && plan.workMinutes > 0
		&& Number.isFinite(plan.restMinutes) && plan.restMinutes > 0;
}
