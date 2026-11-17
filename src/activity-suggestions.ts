import type { PomodoroSession, TodoistTask } from './types';

export type ActivityRecency = Record<string, number>;

export interface ActivitySuggestion {
	key: string;
	label: string;
	task?: TodoistTask;
	lastTracked: number;
}

export function activityKey(task: Pick<TodoistTask, 'id' | 'content'>): string {
	return task.id.startsWith('custom:') ? `custom:${task.content.trim().toLowerCase()}` : `todoist:${task.id}`;
}

export function mergeActivityRecency(local: ActivityRecency, incoming: unknown): ActivityRecency {
	const merged = { ...local };
	if (!incoming || typeof incoming !== 'object') return merged;
	for (const [key, time] of Object.entries(incoming)) {
		if (typeof time === 'number' && Number.isFinite(time) && time > (merged[key] ?? 0)) merged[key] = time;
	}
	return merged;
}

export function buildActivitySuggestions(tasks: TodoistTask[], labels: string[], sessions: PomodoroSession[], recent: ActivityRecency): ActivitySuggestion[] {
	const recency = { ...recent };
	const custom = new Map<string, string>();
	for (const label of labels) {
		if (label.trim()) custom.set(`custom:${label.trim().toLowerCase()}`, label);
	}
	for (const session of sessions) {
		const key = activityKey({ id: session.taskId, content: session.taskContent });
		recency[key] = Math.max(recency[key] ?? 0, session.endTime);
		if (session.taskId.startsWith('custom:')) custom.set(key, session.taskContent);
	}
	const suggestions: ActivitySuggestion[] = tasks
		.filter(task => !task.checked && !task.completed_at)
		.map(task => ({ key: activityKey(task), label: task.content, task, lastTracked: recency[activityKey(task)] ?? 0 }));
	for (const [key, label] of custom) suggestions.push({ key, label, lastTracked: recency[key] ?? 0 });
	return suggestions.sort((a, b) => b.lastTracked - a.lastTracked || a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
}
