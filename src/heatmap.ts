import { setIcon } from 'obsidian';
import type { PomodoroSession, MikumodoroSettings, WorkoutTotals } from './types';
import type MikumodoroTimerPlugin from './main';
import { formatLocalDate, formatMinutes, formatRollingYear, getSessionDateKey, rollingYearWindow } from './utils';
import { buildWorkoutMap } from './workout';

interface TaskMinutesEntry {
	taskContent: string;
	minutes: number;
}

interface SelectionSummary {
	totalMinutes: number;
	averageMinutes: number;
	completions: number;
	pushUps: number;
	pullUps: number;
	dips: number;
	tasks: TaskMinutesEntry[];
}

export function renderHeatmap(
	container: HTMLElement,
	sessions: PomodoroSession[],
	settings: MikumodoroSettings,
	plugin?: MikumodoroTimerPlugin,
) {
	removeTooltipFor(container);
	container.empty();
	container.classList.add('mikumodoro-heatmap-container');
	const surface = container.createDiv({ cls: 'mikumodoro-heatmap-surface' });
	const tooltips = attachTooltips(container);

	let viewMode: 'year' | 'month' = settings.heatmapViewMode ?? 'year';
	let currentYear = new Date().getFullYear();
	let currentMonth = new Date().getMonth();
	const requestedHistoryRanges = new Set<string>();

	function requestHistory(key: string, request: () => Promise<boolean>) {
		if (requestedHistoryRanges.has(key)) return;
		requestedHistoryRanges.add(key);
		void request().then(changed => {
			if (changed) render();
		}).catch(err => {
			requestedHistoryRanges.delete(key);
			console.error('Mikumodoro: Failed to load completion history', err);
		});
	}

	// Build date -> total minutes and date -> per-task breakdown
	const dayMap = new Map<string, number>();
	const dayTaskMap = new Map<string, TaskMinutesEntry[]>();
	for (const s of sessions) {
		const day = getSessionDateKey(s);
		dayMap.set(day, (dayMap.get(day) ?? 0) + s.durationMinutes);
		if (!dayTaskMap.has(day)) dayTaskMap.set(day, []);
		const entries = dayTaskMap.get(day)!;
		const displayName = plugin?.getTopLevelTaskContent(s.taskId) ?? s.taskContent;
		const existing = entries.find(e => e.taskContent === displayName);
		if (existing) {
			existing.minutes += s.durationMinutes;
		} else {
			entries.push({ taskContent: displayName, minutes: s.durationMinutes });
		}
	}

	const completionMap = plugin?.getCompletionMap() ?? {};
	const workoutMap = settings.workoutTrackingEnabled && plugin
		? buildWorkoutMap(plugin.getWorkoutRecords())
		: new Map<string, WorkoutTotals>();
	const dueDateSet = new Set<string>();
	const dueDateTasks = new Map<string, string[]>();
	if (plugin) {
		for (const t of plugin.getCachedTasks()) {
			if (t.due?.date) {
				const dateStr = t.due.date.slice(0, 10);
				dueDateSet.add(dateStr);
				if (!dueDateTasks.has(dateStr)) dueDateTasks.set(dateStr, []);
				dueDateTasks.get(dateStr)!.push(t.content);
			}
		}
	}

	function getMaxInRange(valuesByDay: Map<string, number>, startDate: Date, endDate: Date): number {
		const values: number[] = [];
		const d = new Date(startDate);
		while (d <= endDate) {
			const key = formatLocalDate(d);
			const val = valuesByDay.get(key) ?? 0;
			if (val > 0) values.push(val);
			d.setDate(d.getDate() + 1);
		}
		if (values.length === 0) return 1;
		values.sort((a, b) => a - b);
		const p90Index = Math.floor(values.length * 0.9);
		const p90 = values[Math.min(p90Index, values.length - 1)] || 1;
		const actualMax = values[values.length - 1] ?? 1;
		return Math.max(p90, actualMax * 0.5, 1);
	}
	const workoutScoreMap = new Map(
		[...workoutMap].map(([date, workout]) => [date, workout.weightedReps]),
	);
	const getMaxMinutesInRange = (startDate: Date, endDate: Date) => getMaxInRange(dayMap, startDate, endDate);
	const getMaxWorkoutInRange = (startDate: Date, endDate: Date) => getMaxInRange(workoutScoreMap, startDate, endDate);

	let slideDirection: 'left' | 'right' | 'none' = 'none';

	function render() {
		surface.empty();

		const header = surface.createDiv({ cls: 'mikumodoro-heatmap-header' });
		header.createDiv({ cls: 'mikumodoro-heatmap-title-area' });

		const navArea = header.createDiv({ cls: 'mikumodoro-heatmap-nav' });
		const prevBtn = navArea.createEl('button', { cls: 'clickable-icon mikumodoro-heatmap-nav-btn', attr: { 'aria-label': 'Previous period' } });
		const labelEl = navArea.createSpan({ cls: 'mikumodoro-heatmap-nav-label' });
		const nextBtn = navArea.createEl('button', { cls: 'clickable-icon mikumodoro-heatmap-nav-btn', attr: { 'aria-label': 'Next period' } });
		setIcon(prevBtn, 'chevron-left');
		setIcon(nextBtn, 'chevron-right');

		const toggleArea = navArea;
		const yearBtn = toggleArea.createEl('button', {
			cls: 'clickable-icon mikumodoro-heatmap-toggle-btn' + (viewMode === 'year' ? ' is-active' : ''),
			attr: { 'aria-label': 'Year view' },
		});
		const monthBtn = toggleArea.createEl('button', {
			cls: 'clickable-icon mikumodoro-heatmap-toggle-btn' + (viewMode === 'month' ? ' is-active' : ''),
			attr: { 'aria-label': 'Month view' },
		});
		setIcon(yearBtn, 'calendar-range');
		setIcon(monthBtn, 'calendar-days');
		yearBtn.addEventListener('click', () => { viewMode = 'year'; slideDirection = 'none'; render(); });
		monthBtn.addEventListener('click', () => { viewMode = 'month'; slideDirection = 'none'; render(); });

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const contentArea = surface.createDiv({ cls: 'mikumodoro-heatmap-content' });
		if (slideDirection === 'left') contentArea.classList.add('slide-left');
		else if (slideDirection === 'right') contentArea.classList.add('slide-right');

		if (viewMode === 'year') {
			if (plugin) requestHistory(`year:${currentYear}`, () => plugin.ensureCompletionHistoryForRollingYear(currentYear));
			labelEl.setText(formatRollingYear(currentYear));
			prevBtn.addEventListener('click', () => { currentYear--; slideDirection = 'right'; render(); });
			nextBtn.addEventListener('click', () => {
				if (currentYear < today.getFullYear()) { currentYear++; slideDirection = 'left'; render(); }
			});
			if (currentYear >= today.getFullYear()) nextBtn.classList.add('disabled');
			renderYearView(contentArea, currentYear, dayMap, dayTaskMap, workoutMap, completionMap, dueDateSet, dueDateTasks, settings, today, getMaxMinutesInRange, getMaxWorkoutInRange);
		} else {
			if (plugin) requestHistory(`month:${currentYear}:${currentMonth}`, () => plugin.ensureCompletionHistoryForMonth(currentYear, currentMonth));
			const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
			labelEl.setText(`${monthNames[currentMonth]} ${currentYear}`);
			prevBtn.addEventListener('click', () => {
				currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; }
				slideDirection = 'right'; render();
			});
			nextBtn.addEventListener('click', () => {
				if (currentYear < today.getFullYear() || (currentYear === today.getFullYear() && currentMonth < today.getMonth())) {
					currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; }
					slideDirection = 'left'; render();
				}
			});
			if (currentYear > today.getFullYear() || (currentYear === today.getFullYear() && currentMonth >= today.getMonth())) {
				nextBtn.classList.add('disabled');
			}
			renderMonthView(contentArea, currentYear, currentMonth, dayMap, dayTaskMap, workoutMap, completionMap, dueDateSet, dueDateTasks, settings, today, getMaxMinutesInRange, getMaxWorkoutInRange);
		}
		tooltips.bindCells(surface);
	}

	render();
	attachDragSelection(surface, container);
}

function renderYearView(
	container: HTMLElement,
	year: number,
	dayMap: Map<string, number>,
	dayTaskMap: Map<string, TaskMinutesEntry[]>,
	workoutMap: Map<string, WorkoutTotals>,
	completionMap: Record<string, Array<{taskId: string; taskContent: string; timestamp: number}>>,
	dueDateSet: Set<string>,
	dueDateTasks: Map<string, string[]>,
	settings: MikumodoroSettings,
	today: Date,
	getMax: (start: Date, end: Date) => number,
	getMaxWorkout: (start: Date, end: Date) => number,
) {
	const { start: yearStart, end: yearEnd } = rollingYearWindow(year, today);
	const maxMinutes = getMax(yearStart, yearEnd);
	const maxWorkout = getMaxWorkout(yearStart, yearEnd);

	const totalMinutes = sumMinutesInRange(dayMap, yearStart, yearEnd);
	const statsEl = container.createDiv({ cls: 'mikumodoro-heatmap-stats' });
	statsEl.setText(`${formatMinutes(totalMinutes)} in this period`);

	const gridWrapper = container.createDiv({ cls: 'mikumodoro-heatmap-grid-wrapper' });

	const labelsCol = gridWrapper.createDiv({ cls: 'mikumodoro-heatmap-labels' });
	const dayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
	for (let i = 0; i < 7; i++) {
		labelsCol.createDiv({
			cls: 'mikumodoro-heatmap-day-label',
			text: i % 2 === 1 ? dayLabels[i] : '',
		});
	}

	const gridArea = gridWrapper.createDiv({ cls: 'mikumodoro-heatmap-grid-area' });
	const monthLabelRow = gridArea.createDiv({ cls: 'mikumodoro-heatmap-month-labels' });
	const grid = gridArea.createDiv({ cls: 'mikumodoro-heatmap-grid' });

	const cursor = new Date(yearEnd);
	cursor.setDate(cursor.getDate() - cursor.getDay() - 52 * 7);

	for (let currentWeek = 0; currentWeek < 53; currentWeek++) {
		const monthLabel = monthLabelRow.createSpan({ cls: 'mikumodoro-heatmap-month-label' });
		const columnDates = Array.from({ length: 7 }, (_, offset) => {
			const date = new Date(cursor);
			date.setDate(cursor.getDate() + offset);
			return date;
		});
		const validDates = columnDates.filter(date => date >= yearStart && date <= yearEnd);
		const monthStart = currentWeek === 0 ? validDates[0] : validDates.find(date => date.getDate() === 1);
		monthLabel.setText(monthStart?.toLocaleDateString(undefined, { month: 'short' }) ?? '');

		const weekCol = grid.createDiv({ cls: 'mikumodoro-heatmap-week' });

		for (const date of columnDates) {
			const isInYear = date >= yearStart && date <= yearEnd;
			const dateStr = formatLocalDate(date);
			const minutes = dayMap.get(dateStr) ?? 0;
			const completions = completionMap[dateStr]?.length ?? 0;
			const workout = workoutMap.get(dateStr);
			const isFuture = date > today;
			const isToday = dateStr === formatLocalDate(today);
			const hasDue = dueDateSet.has(dateStr);

			const cell = weekCol.createDiv({ cls: 'mikumodoro-heatmap-cell' });
			if (isInYear) {
				cell.dataset.selectionDay = dateStr;
				cell.dataset.selectionMinutes = String(minutes);
				cell.dataset.selectionCompletions = String(completions);
				cell.dataset.selectionPushUps = String(workout?.pushUps ?? 0);
				cell.dataset.selectionPullUps = String(workout?.pullUps ?? 0);
				cell.dataset.selectionDips = String(workout?.dips ?? 0);
				cell.dataset.selectionTasks = JSON.stringify(dayTaskMap.get(dateStr) ?? []);
			}

			if (!isInYear) {
				cell.classList.add('out-of-range');
			} else if (isFuture) {
				cell.classList.add('future');
			} else if (minutes === 0) {
				cell.classList.add('empty');
			} else {
				const intensity = Math.min(1, minutes / maxMinutes);
				cell.style.setProperty('--mikumodoro-heatmap-cell-background', interpolateColor(settings.heatmapColor, intensity));
			}

			if (isInYear) {
				if (hasDue) cell.classList.add('has-due');
				if (workout && !isFuture) {
					cell.classList.add('has-workout');
					const intensity = Math.min(1, workout.weightedReps / maxWorkout);
					cell.style.setProperty('--mikumodoro-workout-border', interpolateColor('#84cc16', intensity));
				}
			}

			if (isInYear) {
				const dueTasks = dueDateTasks.get(dateStr) ?? [];
				const tooltipText = buildTooltip(dateStr, date, minutes, completions, hasDue, dueTasks, dayTaskMap, workout);
				cell.setAttribute('data-tooltip', tooltipText);
				cell.classList.add('has-tooltip');
			}

			if (isToday) cell.classList.add('today');
		}

		cursor.setDate(cursor.getDate() + 7);
	}

	renderLegend(container, settings);
}

function renderMonthView(
	container: HTMLElement,
	year: number,
	month: number,
	dayMap: Map<string, number>,
	dayTaskMap: Map<string, TaskMinutesEntry[]>,
	workoutMap: Map<string, WorkoutTotals>,
	completionMap: Record<string, Array<{taskId: string; taskContent: string; timestamp: number}>>,
	dueDateSet: Set<string>,
	dueDateTasks: Map<string, string[]>,
	settings: MikumodoroSettings,
	today: Date,
	getMax: (start: Date, end: Date) => number,
	getMaxWorkout: (start: Date, end: Date) => number,
) {
	const monthStart = new Date(year, month, 1);
	const monthEnd = new Date(year, month + 1, 0);
	const maxMinutes = getMax(monthStart, monthEnd);
	const maxWorkout = getMaxWorkout(monthStart, monthEnd);

	const totalMinutes = sumMinutesInRange(dayMap, monthStart, monthEnd);
	const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
	const statsEl = container.createDiv({ cls: 'mikumodoro-heatmap-stats' });
	statsEl.setText(`${formatMinutes(totalMinutes)} in ${monthNames[month]} ${year}`);

	const dayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
	const headerRow = container.createDiv({ cls: 'mikumodoro-heatmap-month-header' });
	for (const dl of dayLabels) {
		headerRow.createDiv({ cls: 'mikumodoro-heatmap-month-day-label', text: dl });
	}

	const calGrid = container.createDiv({ cls: 'mikumodoro-heatmap-month-grid' });
	const firstDayOfWeek = monthStart.getDay();
	for (let i = 0; i < firstDayOfWeek; i++) {
		calGrid.createDiv({ cls: 'mikumodoro-heatmap-month-cell out-of-range' });
	}

	for (let day = 1; day <= monthEnd.getDate(); day++) {
		const date = new Date(year, month, day);
		const dateStr = formatLocalDate(date);
		const minutes = dayMap.get(dateStr) ?? 0;
		const completions = completionMap[dateStr]?.length ?? 0;
		const workout = workoutMap.get(dateStr);
		const isFuture = date > today;
		const isToday = dateStr === formatLocalDate(today);
		const hasDue = dueDateSet.has(dateStr);

		const cell = calGrid.createDiv({ cls: 'mikumodoro-heatmap-month-cell' });
		cell.dataset.selectionDay = dateStr;
		cell.dataset.selectionMinutes = String(minutes);
		cell.dataset.selectionCompletions = String(completions);
		cell.dataset.selectionPushUps = String(workout?.pushUps ?? 0);
		cell.dataset.selectionPullUps = String(workout?.pullUps ?? 0);
		cell.dataset.selectionDips = String(workout?.dips ?? 0);
		cell.dataset.selectionTasks = JSON.stringify(dayTaskMap.get(dateStr) ?? []);
		cell.createSpan({ cls: 'mikumodoro-heatmap-month-day-num', text: String(day) });

		if (isFuture) {
			cell.classList.add('future');
		} else if (minutes > 0) {
			const intensity = Math.min(1, minutes / maxMinutes);
			cell.style.setProperty('--mikumodoro-heatmap-cell-background', interpolateColor(settings.heatmapColor, intensity));
		} else {
			cell.classList.add('empty');
		}

		if (hasDue) cell.classList.add('has-due');
		if (workout && !isFuture) {
			cell.classList.add('has-workout');
			const intensity = Math.min(1, workout.weightedReps / maxWorkout);
			cell.style.setProperty('--mikumodoro-workout-border', interpolateColor('#84cc16', intensity));
		}

		const dueTasks = dueDateTasks.get(dateStr) ?? [];
		const tooltipText = buildTooltip(dateStr, date, minutes, completions, hasDue, dueTasks, dayTaskMap, workout);
		cell.setAttribute('data-tooltip', tooltipText);
		cell.classList.add('has-tooltip');

		if (isToday) cell.classList.add('today');
	}

	renderLegend(container, settings);
}

export function buildTooltip(
	dateStr: string,
	date: Date,
	minutes: number,
	completions: number,
	hasDue: boolean,
	dueTasks: string[],
	dayTaskMap: Map<string, TaskMinutesEntry[]>,
	workout?: WorkoutTotals,
): string {
	const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	const lines: string[] = [];
	if (workout) {
		lines.push(dateLabel);
	}
	if (minutes > 0) {
		lines.push(workout
			? `  Worked: ${formatMinutes(minutes)} total`
			: `${dateLabel}: ${formatMinutes(minutes)} total`);
	}
	if (workout) {
		lines.push(`  Push-ups: ${workout.pushUps}`);
		lines.push(`  Pull-ups: ${workout.pullUps}`);
		lines.push(`  Dips: ${workout.dips}`);
	}
	if (minutes > 0) {
		const taskEntries = dayTaskMap.get(dateStr);
		if (taskEntries && taskEntries.length > 0) {
			const sorted = [...taskEntries].sort((a, b) => b.minutes - a.minutes);
			const shown = sorted.slice(0, 5);
			for (const t of shown) {
				const name = t.taskContent.length > 30 ? t.taskContent.slice(0, 30) + '...' : t.taskContent;
				lines.push(`  ${name}: ${formatMinutes(t.minutes)}`);
			}
			if (sorted.length > 5) {
				lines.push(`  and ${sorted.length - 5} more`);
			}
		}
	} else if (!workout) {
		lines.push(dateLabel);
	}
	const extras: string[] = [];
	if (completions > 0) extras.push(`${completions} Todoist ${completions === 1 ? 'task' : 'tasks'} completed`);
	if (hasDue && dueTasks.length > 0) {
		const shownDue = dueTasks.slice(0, 4).map(t => t.length > 30 ? t.slice(0, 30) + '...' : t);
		extras.push('due: ' + shownDue.join(', '));
		if (dueTasks.length > 4) extras.push(`+${dueTasks.length - 4} more due`);
	} else if (hasDue) {
		extras.push('has due tasks');
	}
	if (extras.length > 0) {
		lines.push(extras.join(' - '));
	}
	return lines.join('\n');
}

const tooltipCleanups = new WeakMap<HTMLElement, () => void>();

function removeTooltipFor(owner: HTMLElement): void {
	tooltipCleanups.get(owner)?.();
}

function attachTooltips(owner: HTMLElement): { bindCells: (surface: HTMLElement) => void } {
	const tooltipEl = document.body.createDiv({ cls: 'mikumodoro-heatmap-tooltip' });
	let activeCell: HTMLElement | null = null;

	const show = (target: HTMLElement) => {
		const text = target.getAttribute('data-tooltip');
		if (!text) return;
		activeCell = target;
		tooltipEl.textContent = text;
		tooltipEl.classList.add('is-visible');
		const rect = target.getBoundingClientRect();
		const tipRect = tooltipEl.getBoundingClientRect();
		let left = rect.left + rect.width / 2 - tipRect.width / 2;
		let top = rect.top - tipRect.height - 8;
		left = Math.max(6, Math.min(left, window.innerWidth - tipRect.width - 6));
		if (top < 6) top = rect.bottom + 8;
		tooltipEl.style.left = `${left}px`;
		tooltipEl.style.top = `${top}px`;
	};

	const hide = (event: MouseEvent) => {
		if (event.currentTarget !== activeCell) return;
		activeCell = null;
		tooltipEl.classList.remove('is-visible');
	};

	const observer = new MutationObserver(() => {
		if (!owner.isConnected) cleanup();
	});
	const cleanup = () => {
		observer.disconnect();
		tooltipEl.remove();
		tooltipCleanups.delete(owner);
	};
	observer.observe(document.body, { childList: true, subtree: true });
	tooltipCleanups.set(owner, cleanup);

	return {
		bindCells(surface: HTMLElement) {
			surface.querySelectorAll<HTMLElement>('.has-tooltip').forEach(cell => {
				cell.addEventListener('mouseenter', () => show(cell));
				cell.addEventListener('mouseleave', hide);
			});
		},
	};
}

export function summarizeSelectedDays(
	days: Array<{
		minutes: number;
		completions: number;
		pushUps?: number;
		pullUps?: number;
		dips?: number;
		tasks: TaskMinutesEntry[];
	}>,
): SelectionSummary {
	const totalMinutes = days.reduce((total, day) => total + day.minutes, 0);
	const taskTotals = new Map<string, number>();
	for (const day of days) {
		for (const task of day.tasks) {
			taskTotals.set(task.taskContent, (taskTotals.get(task.taskContent) ?? 0) + task.minutes);
		}
	}
	return {
		totalMinutes,
		averageMinutes: days.length > 0 ? Math.round(totalMinutes / days.length) : 0,
		completions: days.reduce((total, day) => total + day.completions, 0),
		pushUps: days.reduce((total, day) => total + (day.pushUps ?? 0), 0),
		pullUps: days.reduce((total, day) => total + (day.pullUps ?? 0), 0),
		dips: days.reduce((total, day) => total + (day.dips ?? 0), 0),
		tasks: Array.from(taskTotals, ([taskContent, minutes]) => ({ taskContent, minutes }))
			.sort((a, b) => b.minutes - a.minutes),
	};
}

export function formatSelectionSummary(summary: SelectionSummary): string {
	const lines = [
		`${formatMinutes(summary.totalMinutes)} total · ${formatMinutes(summary.averageMinutes)}/day`,
	];
	if (summary.pushUps > 0 || summary.pullUps > 0 || summary.dips > 0) {
		lines.push(`Push-ups: ${summary.pushUps}`);
		lines.push(`Pull-ups: ${summary.pullUps}`);
		lines.push(`Dips: ${summary.dips}`);
	}
	for (const task of summary.tasks.slice(0, 5)) {
		const name = task.taskContent.length > 30 ? task.taskContent.slice(0, 30) + '...' : task.taskContent;
		lines.push(`${name}: ${formatMinutes(task.minutes)}`);
	}
	if (summary.tasks.length > 5) lines.push(`and ${summary.tasks.length - 5} more`);
	lines.push(`${summary.completions} Todoist ${summary.completions === 1 ? 'task' : 'tasks'} completed`);
	return lines.join('\n');
}

function attachDragSelection(surface: HTMLElement, owner: HTMLElement) {
	interface SelectableCell {
		el: HTMLElement;
		minutes: number;
		completions: number;
		pushUps: number;
		pullUps: number;
		dips: number;
		tasks: TaskMinutesEntry[];
	}

	surface.addEventListener('pointerdown', (event) => {
		if (event.button !== 0) return;
		const target = (event.target as HTMLElement).closest<HTMLElement>('[data-selection-day]');
		if (!target || !surface.contains(target)) return;

		event.preventDefault();
		const startX = event.clientX;
		const startY = event.clientY;
		const selectionBox = document.body.createDiv({ cls: 'mikumodoro-heatmap-selection-box' });
		const statsEl = selectionBox.createDiv({ cls: 'mikumodoro-heatmap-selection-stats' });
		const selectedCells = new Set<HTMLElement>();
		owner.querySelector<HTMLElement>('.mikumodoro-heatmap-tooltip')?.classList.remove('is-visible');
		owner.classList.add('is-drag-selecting');
		const cells: SelectableCell[] = Array.from(surface.querySelectorAll<HTMLElement>('[data-selection-day]')).map(el => {
			let tasks: TaskMinutesEntry[] = [];
			try {
				tasks = JSON.parse(el.dataset.selectionTasks ?? '[]') as TaskMinutesEntry[];
			} catch {
				// A malformed data attribute should not break drag selection.
			}
			return {
				el,
				minutes: Number(el.dataset.selectionMinutes) || 0,
				completions: Number(el.dataset.selectionCompletions) || 0,
				pushUps: Number(el.dataset.selectionPushUps) || 0,
				pullUps: Number(el.dataset.selectionPullUps) || 0,
				dips: Number(el.dataset.selectionDips) || 0,
				tasks,
			};
		});
		let animationFrame: number | null = null;
		let pendingX = startX;
		let pendingY = startY;

		const update = (clientX: number, clientY: number) => {
			const left = Math.min(startX, clientX);
			const top = Math.min(startY, clientY);
			const right = Math.max(startX, clientX);
			const bottom = Math.max(startY, clientY);
			selectionBox.style.left = `${left}px`;
			selectionBox.style.top = `${top}px`;
			selectionBox.style.width = `${right - left}px`;
			selectionBox.style.height = `${bottom - top}px`;

			selectedCells.clear();
			const selectedDays: Array<{
				minutes: number;
				completions: number;
				pushUps: number;
				pullUps: number;
				dips: number;
				tasks: TaskMinutesEntry[];
			}> = [];
			for (const cell of cells) {
				const rect = cell.el.getBoundingClientRect();
				const intersects = rect.right >= left && rect.left <= right && rect.bottom >= top && rect.top <= bottom;
				cell.el.classList.toggle('is-drag-selected', intersects);
				if (intersects) {
					selectedCells.add(cell.el);
					selectedDays.push({
						minutes: cell.minutes,
						completions: cell.completions,
						pushUps: cell.pushUps,
						pullUps: cell.pullUps,
						dips: cell.dips,
						tasks: cell.tasks,
					});
				}
			}

			statsEl.setText(formatSelectionSummary(summarizeSelectedDays(selectedDays)));
		};

		const finish = () => {
			for (const cell of selectedCells) cell.classList.remove('is-drag-selected');
			owner.classList.remove('is-drag-selecting');
			selectionBox.remove();
			if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', finish);
			window.removeEventListener('pointercancel', finish);
			window.removeEventListener('blur', finish);
		};
		const onMove = (moveEvent: PointerEvent) => {
			moveEvent.preventDefault();
			pendingX = moveEvent.clientX;
			pendingY = moveEvent.clientY;
			if (animationFrame !== null) return;
			animationFrame = window.requestAnimationFrame(() => {
				animationFrame = null;
				update(pendingX, pendingY);
			});
		};

		window.addEventListener('pointermove', onMove, { passive: false });
		window.addEventListener('pointerup', finish);
		window.addEventListener('pointercancel', finish);
		window.addEventListener('blur', finish);
		update(startX, startY);
	});
}

function renderLegend(container: HTMLElement, settings: MikumodoroSettings) {
	const legend = container.createDiv({ cls: 'mikumodoro-heatmap-legend' });
	legend.createSpan({ cls: 'mikumodoro-heatmap-legend-label', text: 'Less' });
	for (let i = 0; i < 5; i++) {
		const intensity = i / 4;
		const swatch = legend.createDiv({ cls: 'mikumodoro-heatmap-cell' });
		if (i === 0) {
			swatch.classList.add('empty');
		} else {
			swatch.style.backgroundColor = interpolateColor(settings.heatmapColor, intensity);
		}
	}
	legend.createSpan({ cls: 'mikumodoro-heatmap-legend-label', text: 'More' });
}

function sumMinutesInRange(dayMap: Map<string, number>, start: Date, end: Date): number {
	let total = 0;
	const d = new Date(start);
	while (d <= end) {
		const key = formatLocalDate(d);
		total += dayMap.get(key) ?? 0;
		d.setDate(d.getDate() + 1);
	}
	return total;
}

function interpolateColor(hex: string, intensity: number): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	const baseColor = getComputedStyle(document.body).getPropertyValue('--background-modifier-border').trim();
	let bgR = 235, bgG = 237, bgB = 240;
	if (baseColor.startsWith('#')) {
		bgR = parseInt(baseColor.slice(1, 3), 16);
		bgG = parseInt(baseColor.slice(3, 5), 16);
		bgB = parseInt(baseColor.slice(5, 7), 16);
	} else if (baseColor.startsWith('rgb')) {
		const m = baseColor.match(/\d+/g);
		if (m && m[0] && m[1] && m[2]) { bgR = +m[0]; bgG = +m[1]; bgB = +m[2]; }
	}
	const finalR = Math.round(bgR + (r - bgR) * intensity);
	const finalG = Math.round(bgG + (g - bgG) * intensity);
	const finalB = Math.round(bgB + (b - bgB) * intensity);
	return `rgb(${finalR}, ${finalG}, ${finalB})`;
}
