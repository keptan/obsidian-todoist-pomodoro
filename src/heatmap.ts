import type { PomodoroSession, MikumodoroSettings } from './types';
import type MikumodoroTimerPlugin from './main';
import { formatLocalDate, formatMinutes } from './utils';

interface TaskMinutesEntry {
	taskContent: string;
	minutes: number;
}

interface SelectionSummary {
	totalMinutes: number;
	averageMinutes: number;
	completions: number;
	tasks: TaskMinutesEntry[];
}

export function renderHeatmap(
	container: HTMLElement,
	sessions: PomodoroSession[],
	settings: MikumodoroSettings,
	plugin?: MikumodoroTimerPlugin,
) {
	container.empty();
	container.classList.add('mikumodoro-heatmap-container');

	let viewMode: 'year' | 'month' = settings.heatmapViewMode ?? 'year';
	let currentYear = new Date().getFullYear();
	let currentMonth = new Date().getMonth();
	const requestedHistoryRanges = new Set<string>();

	function requestHistory(key: string, request: () => Promise<boolean>) {
		if (requestedHistoryRanges.has(key)) return;
		requestedHistoryRanges.add(key);
		void request().then(() => render()).catch(err => {
			requestedHistoryRanges.delete(key);
			console.error('Mikumodoro: Failed to load completion history', err);
		});
	}

	// Build date -> total minutes and date -> per-task breakdown
	const dayMap = new Map<string, number>();
	const dayTaskMap = new Map<string, TaskMinutesEntry[]>();
	for (const s of sessions) {
		const day = formatLocalDate(new Date(s.startTime));
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

	function getMaxMinutesInRange(startDate: Date, endDate: Date): number {
		const values: number[] = [];
		const d = new Date(startDate);
		while (d <= endDate) {
			const key = formatLocalDate(d);
			const val = dayMap.get(key) ?? 0;
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

	let slideDirection: 'left' | 'right' | 'none' = 'none';

	function render() {
		container.empty();

		const header = container.createDiv({ cls: 'mikumodoro-heatmap-header' });
		header.createDiv({ cls: 'mikumodoro-heatmap-title-area' });

		const navArea = header.createDiv({ cls: 'mikumodoro-heatmap-nav' });
		const prevBtn = navArea.createEl('button', { cls: 'mikumodoro-heatmap-nav-btn', text: '‹' });
		const labelEl = navArea.createSpan({ cls: 'mikumodoro-heatmap-nav-label' });
		const nextBtn = navArea.createEl('button', { cls: 'mikumodoro-heatmap-nav-btn', text: '›' });

		const toggleArea = navArea;
		const yearBtn = toggleArea.createEl('button', {
			cls: 'mikumodoro-heatmap-toggle-btn' + (viewMode === 'year' ? ' active' : ''),
			text: '📅',
			attr: { 'aria-label': 'Year view' },
		});
		const monthBtn = toggleArea.createEl('button', {
			cls: 'mikumodoro-heatmap-toggle-btn' + (viewMode === 'month' ? ' active' : ''),
			text: '🗓️',
			attr: { 'aria-label': 'Month view' },
		});
		yearBtn.addEventListener('click', () => { viewMode = 'year'; slideDirection = 'none'; render(); });
		monthBtn.addEventListener('click', () => { viewMode = 'month'; slideDirection = 'none'; render(); });

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const contentArea = container.createDiv({ cls: 'mikumodoro-heatmap-content' });
		if (slideDirection === 'left') contentArea.classList.add('slide-left');
		else if (slideDirection === 'right') contentArea.classList.add('slide-right');

		if (viewMode === 'year') {
			if (plugin) requestHistory(`year:${currentYear}`, () => plugin.ensureCompletionHistoryForYear(currentYear));
			labelEl.setText(String(currentYear));
			prevBtn.addEventListener('click', () => { currentYear--; slideDirection = 'right'; render(); });
			nextBtn.addEventListener('click', () => {
				if (currentYear < today.getFullYear()) { currentYear++; slideDirection = 'left'; render(); }
			});
			if (currentYear >= today.getFullYear()) nextBtn.classList.add('disabled');
			renderYearView(contentArea, currentYear, dayMap, dayTaskMap, completionMap, dueDateSet, dueDateTasks, settings, today, getMaxMinutesInRange);
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
			renderMonthView(contentArea, currentYear, currentMonth, dayMap, dayTaskMap, completionMap, dueDateSet, dueDateTasks, settings, today, getMaxMinutesInRange);
		}
	}

	render();
	attachTooltips(container);
	attachDragSelection(container);
}

function renderYearView(
	container: HTMLElement,
	year: number,
	dayMap: Map<string, number>,
	dayTaskMap: Map<string, TaskMinutesEntry[]>,
	completionMap: Record<string, Array<{taskId: string; taskContent: string; timestamp: number}>>,
	dueDateSet: Set<string>,
	dueDateTasks: Map<string, string[]>,
	settings: MikumodoroSettings,
	today: Date,
	getMax: (start: Date, end: Date) => number,
) {
	const yearStart = new Date(year, 0, 1);
	const yearEnd = new Date(year, 11, 31);
	const maxMinutes = getMax(yearStart, yearEnd);

	const totalMinutes = sumMinutesInRange(dayMap, yearStart, yearEnd);
	const statsEl = container.createDiv({ cls: 'mikumodoro-heatmap-stats' });
	statsEl.setText(`${formatMinutes(totalMinutes)} in ${year}`);

	const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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

	const startDate = new Date(year, 0, 1);
	startDate.setDate(startDate.getDate() - startDate.getDay());

	let currentWeek = 0;
	const cursor = new Date(startDate);

	while (cursor <= yearEnd && currentWeek < 54) {
		const monthLabel = monthLabelRow.createSpan({ cls: 'mikumodoro-heatmap-month-label' });
		const firstWeekDate = new Date(cursor);
		const prevWeekDate = new Date(cursor.getTime() - 7 * 86400000);
		if (firstWeekDate.getMonth() !== prevWeekDate.getMonth() || currentWeek === 0) {
			const monthIdx = firstWeekDate.getMonth();
			if (currentWeek === 0 && monthIdx === 11) {
				monthLabel.setText('');
			} else {
				monthLabel.setText(monthLabels[monthIdx] ?? '');
			}
		}

		const weekCol = grid.createDiv({ cls: 'mikumodoro-heatmap-week' });

		for (let d = 0; d < 7; d++) {
			const date = new Date(cursor);
			date.setDate(cursor.getDate() + d);

			const isInYear = date.getFullYear() === year;
			const dateStr = formatLocalDate(date);
			const minutes = dayMap.get(dateStr) ?? 0;
			const completions = completionMap[dateStr]?.length ?? 0;
			const isFuture = date > today;
			const isToday = dateStr === formatLocalDate(today);
			const hasDue = dueDateSet.has(dateStr);

			const cell = weekCol.createDiv({ cls: 'mikumodoro-heatmap-cell' });
			if (isInYear) {
				cell.dataset.selectionDay = dateStr;
				cell.dataset.selectionMinutes = String(minutes);
				cell.dataset.selectionCompletions = String(completions);
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
				cell.style.backgroundColor = interpolateColor(settings.heatmapColor, intensity);
			}

			if (isInYear) {
				if (hasDue) cell.classList.add('has-due');
			}

			if (isInYear) {
				const dueTasks = dueDateTasks.get(dateStr) ?? [];
				const tooltipText = buildTooltip(dateStr, date, minutes, completions, hasDue, dueTasks, dayTaskMap);
				cell.setAttribute('data-tooltip', tooltipText);
				cell.classList.add('has-tooltip');
			}

			if (isToday) cell.classList.add('today');
		}

		cursor.setDate(cursor.getDate() + 7);
		currentWeek++;
	}

	renderLegend(container, settings);
}

function renderMonthView(
	container: HTMLElement,
	year: number,
	month: number,
	dayMap: Map<string, number>,
	dayTaskMap: Map<string, TaskMinutesEntry[]>,
	completionMap: Record<string, Array<{taskId: string; taskContent: string; timestamp: number}>>,
	dueDateSet: Set<string>,
	dueDateTasks: Map<string, string[]>,
	settings: MikumodoroSettings,
	today: Date,
	getMax: (start: Date, end: Date) => number,
) {
	const monthStart = new Date(year, month, 1);
	const monthEnd = new Date(year, month + 1, 0);
	const maxMinutes = getMax(monthStart, monthEnd);

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
		const isFuture = date > today;
		const isToday = dateStr === formatLocalDate(today);
		const hasDue = dueDateSet.has(dateStr);

		const cell = calGrid.createDiv({ cls: 'mikumodoro-heatmap-month-cell' });
		cell.dataset.selectionDay = dateStr;
		cell.dataset.selectionMinutes = String(minutes);
		cell.dataset.selectionCompletions = String(completions);
		cell.dataset.selectionTasks = JSON.stringify(dayTaskMap.get(dateStr) ?? []);
		cell.createSpan({ cls: 'mikumodoro-heatmap-month-day-num', text: String(day) });

		if (isFuture) {
			cell.classList.add('future');
		} else if (minutes > 0) {
			const intensity = Math.min(1, minutes / maxMinutes);
			cell.style.backgroundColor = interpolateColor(settings.heatmapColor, intensity);
		} else {
			cell.classList.add('empty');
		}

		if (hasDue) cell.classList.add('has-due');

		const dueTasks = dueDateTasks.get(dateStr) ?? [];
		const tooltipText = buildTooltip(dateStr, date, minutes, completions, hasDue, dueTasks, dayTaskMap);
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
): string {
	const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	const lines: string[] = [];
	if (minutes > 0) {
		lines.push(`${dateLabel}: ${formatMinutes(minutes)} total`);
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
	} else {
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

function attachTooltips(container: HTMLElement) {
	if (container.dataset.tooltipsAttached) return;
	container.dataset.tooltipsAttached = '1';

	let tooltipEl = document.body.querySelector<HTMLElement>('.mikumodoro-heatmap-tooltip');
	if (!tooltipEl) {
		tooltipEl = createDiv();
		tooltipEl.className = 'mikumodoro-heatmap-tooltip';
		document.body.appendChild(tooltipEl);
	}

	const show = (target: HTMLElement) => {
		const text = target.getAttribute('data-tooltip');
		if (!text) return;
		tooltipEl.textContent = text;
		tooltipEl.classList.add('is-visible');
		const rect = target.getBoundingClientRect();
		const tipRect = tooltipEl.getBoundingClientRect();
		let left = rect.left + rect.width / 2 - tipRect.width / 2;
		let top = rect.top - tipRect.height - 6;
		left = Math.max(4, Math.min(left, window.innerWidth - tipRect.width - 4));
		if (top < 4) top = rect.bottom + 6;
		tooltipEl.style.left = `${left}px`;
		tooltipEl.style.top = `${top}px`;
	};

	container.addEventListener('mouseover', (e) => {
		const target = (e.target as HTMLElement).closest<HTMLElement>('.has-tooltip');
		if (target) {
			show(target);
		} else {
			tooltipEl.classList.remove('is-visible');
		}
	});

	container.addEventListener('mouseleave', () => {
		tooltipEl.classList.remove('is-visible');
	});
}

export function summarizeSelectedDays(
	days: Array<{ minutes: number; completions: number; tasks: TaskMinutesEntry[] }>,
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
		tasks: Array.from(taskTotals, ([taskContent, minutes]) => ({ taskContent, minutes }))
			.sort((a, b) => b.minutes - a.minutes),
	};
}

export function formatSelectionSummary(summary: SelectionSummary): string {
	const lines = [
		`${formatMinutes(summary.totalMinutes)} total · ${formatMinutes(summary.averageMinutes)}/day`,
	];
	for (const task of summary.tasks.slice(0, 5)) {
		const name = task.taskContent.length > 30 ? task.taskContent.slice(0, 30) + '...' : task.taskContent;
		lines.push(`${name}: ${formatMinutes(task.minutes)}`);
	}
	if (summary.tasks.length > 5) lines.push(`and ${summary.tasks.length - 5} more`);
	lines.push(`${summary.completions} Todoist ${summary.completions === 1 ? 'task' : 'tasks'} completed`);
	return lines.join('\n');
}

function attachDragSelection(container: HTMLElement) {
	if (container.dataset.dragSelectionAttached) return;
	container.dataset.dragSelectionAttached = '1';

	container.addEventListener('pointerdown', (event) => {
		if (event.button !== 0) return;
		const target = (event.target as HTMLElement).closest<HTMLElement>('[data-selection-day]');
		if (!target || !container.contains(target)) return;

		event.preventDefault();
		const startX = event.clientX;
		const startY = event.clientY;
		const selectionBox = document.body.createDiv({ cls: 'mikumodoro-heatmap-selection-box' });
		const statsEl = selectionBox.createDiv({ cls: 'mikumodoro-heatmap-selection-stats' });
		const selectedCells = new Set<HTMLElement>();
		document.body.querySelector<HTMLElement>('.mikumodoro-heatmap-tooltip')?.classList.remove('is-visible');
		container.classList.add('is-drag-selecting');

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
			const selectedDays: Array<{ minutes: number; completions: number; tasks: TaskMinutesEntry[] }> = [];
			for (const cell of Array.from(container.querySelectorAll<HTMLElement>('[data-selection-day]'))) {
				const rect = cell.getBoundingClientRect();
				const intersects = rect.right >= left && rect.left <= right && rect.bottom >= top && rect.top <= bottom;
				cell.classList.toggle('is-drag-selected', intersects);
				if (intersects) {
					selectedCells.add(cell);
					let tasks: TaskMinutesEntry[] = [];
					try {
						tasks = JSON.parse(cell.dataset.selectionTasks ?? '[]') as TaskMinutesEntry[];
					} catch {
						// A malformed data attribute should not break drag selection.
					}
					selectedDays.push({
						minutes: Number(cell.dataset.selectionMinutes) || 0,
						completions: Number(cell.dataset.selectionCompletions) || 0,
						tasks,
					});
				}
			}

			statsEl.setText(formatSelectionSummary(summarizeSelectedDays(selectedDays)));
		};

		const finish = () => {
			for (const cell of selectedCells) cell.classList.remove('is-drag-selected');
			container.classList.remove('is-drag-selecting');
			selectionBox.remove();
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', finish);
			window.removeEventListener('pointercancel', finish);
			window.removeEventListener('blur', finish);
		};
		const onMove = (moveEvent: PointerEvent) => {
			moveEvent.preventDefault();
			update(moveEvent.clientX, moveEvent.clientY);
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
