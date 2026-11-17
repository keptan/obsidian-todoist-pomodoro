import { taskDateLabel } from '../task-dates';
import type { TaskDate } from '../task-dates';

export function renderTaskDateBadge(container: HTMLElement, date: TaskDate | null): void {
	if (!date) return;
	const label = taskDateLabel(date);
	container.createSpan({
		cls: `mikumodoro-task-badge mikumodoro-due-badge due-in-${Math.min(7, Math.max(0, date.daysAway))}`,
		text: date.daysAway === 0 ? '❗' : String(date.daysAway),
		attr: { 'aria-label': label, 'title': label },
	});
}
