import type { TodoistTask } from './types';

export interface TaskDate {
	task: TodoistTask;
	date: string;
	source: 'deadline' | 'date';
	daysAway: number;
}

function calendarDay(date: string): number | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(date);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]) - 1;
	const day = Number(match[3]);
	const parsed = new Date(Date.UTC(year, month, day));
	if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month || parsed.getUTCDate() !== day) return null;
	return parsed.getTime() / 86400000;
}

/** Resolve dates once per render, rolling each task's closest date up its ancestors. */
export function buildTaskDates(tasks: TodoistTask[], today = new Date()): Map<string, TaskDate | null> {
	const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000;
	const children = new Map<string, TodoistTask[]>();
	for (const task of tasks) {
		if (!task.parent_id) continue;
		const siblings = children.get(task.parent_id) ?? [];
		siblings.push(task);
		children.set(task.parent_id, siblings);
	}
	const dates = new Map<string, TaskDate | null>();
	const visiting = new Set<string>();
	const resolve = (task: TodoistTask): TaskDate | null => {
		if (dates.has(task.id)) return dates.get(task.id) ?? null;
		if (visiting.has(task.id) || task.checked || task.completed_at) return null;
		visiting.add(task.id);
		const source = task.deadline?.date ? 'deadline' : 'date';
		const date = task.deadline?.date || task.due?.date;
		const day = date ? calendarDay(date) : null;
		let closest: TaskDate | null = day !== null && date
			? { task, date: date.slice(0, 10), source, daysAway: day - todayDay }
			: null;
		for (const child of children.get(task.id) ?? []) {
			closest = closestTaskDate([closest, resolve(child)]);
		}
		visiting.delete(task.id);
		dates.set(task.id, closest);
		return closest;
	};
	for (const task of tasks) resolve(task);
	return dates;
}

export function closestTaskDate(dates: Iterable<TaskDate | null | undefined>): TaskDate | null {
	let closest: TaskDate | null = null;
	for (const date of dates) {
		if (date && (!closest || date.daysAway < closest.daysAway)) closest = date;
	}
	return closest;
}

export function taskDateLabel(date: TaskDate): string {
	const days = Math.abs(date.daysAway);
	const relative = date.daysAway === 0 ? 'today'
		: date.daysAway < 0 ? `${days} ${days === 1 ? 'day' : 'days'} overdue`
			: `in ${days} ${days === 1 ? 'day' : 'days'}`;
	const source = date.source === 'deadline' ? 'Deadline' : 'Assigned date';
	return `${date.task.content}: ${source} ${relative} (${date.date})`;
}
