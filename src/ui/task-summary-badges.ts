import type { TaskDate } from '../task-dates';
import type { TaskSummary } from '../task-summary';
import { renderTaskDateBadge } from './task-date-badge';

export function formatTaskTime(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
	return `${m}m`;
}

export function renderTaskSummaryBadges(container: HTMLElement, date: TaskDate | null, summary: TaskSummary | undefined, project = false): void {
	const row = container.createSpan({ cls: 'mikumodoro-task-badges' });
	renderTaskDateBadge(row, date);
	if (!summary) return;
	const badge = (text: string, label: string, kind: string) => row.createSpan({
		cls: `mikumodoro-task-badge mikumodoro-task-${kind}`,
		text,
		attr: { title: label, 'aria-label': label },
	});
	if (summary.count > 0) {
		badge(String(summary.count), `${summary.count} active ${project ? 'tasks, including subtasks' : 'subtasks'}`, 'count');
	}
	if (summary.totalMinutes > 0) {
		const total = formatTaskTime(summary.totalMinutes);
		badge(total, `Total time, including completed tasks and subtasks: ${total}`, 'total-time');
	}
}
