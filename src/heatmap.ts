import type { PomodoroSession, MikumodoroSettings } from './types';
import type MikumodoroTimerPlugin from './main';

interface TaskMinutesEntry {
	taskContent: string;
	minutes: number;
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

	// Build date -> total minutes and date -> per-task breakdown
	// Roll up subtask sessions under their top-level parent's name
	const dayMap = new Map<string, number>();
	const dayTaskMap = new Map<string, TaskMinutesEntry[]>();
	for (const s of sessions) {
		const day = new Date(s.startTime).toISOString().slice(0, 10);
		dayMap.set(day, (dayMap.get(day) ?? 0) + s.durationMinutes);
		if (!dayTaskMap.has(day)) dayTaskMap.set(day, []);
		const entries = dayTaskMap.get(day)!;
		// Resolve to top-level parent name if plugin is available
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
			const key = d.toISOString().slice(0, 10);
			const val = dayMap.get(key) ?? 0;
			if (val > 0) values.push(val);
			d.setDate(d.getDate() + 1);
		}
		if (values.length === 0) return 1;
		values.sort((a, b) => a - b);
		// Use 90th percentile as reference max so outliers don't crush the scale
		const p90Index = Math.floor(values.length * 0.9);
		const p90 = values[Math.min(p90Index, values.length - 1)] || 1;
		// But never go below the actual max's 50% so colors are still visible
		const actualMax = values[values.length - 1] ?? 1;
		return Math.max(p90, actualMax * 0.5, 1);
	}

	let slideDirection: 'left' | 'right' | 'none' = 'none';

	function render() {
		container.empty();

		const header = container.createEl('div', { cls: 'mikumodoro-heatmap-header' });
		header.createEl('div', { cls: 'mikumodoro-heatmap-title-area' });

		const navArea = header.createEl('div', { cls: 'mikumodoro-heatmap-nav' });
		const prevBtn = navArea.createEl('button', { cls: 'mikumodoro-heatmap-nav-btn', text: '‹' });
		const labelEl = navArea.createEl('span', { cls: 'mikumodoro-heatmap-nav-label' });
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

		const contentArea = container.createEl('div', { cls: 'mikumodoro-heatmap-content' });
		if (slideDirection === 'left') contentArea.classList.add('slide-left');
		else if (slideDirection === 'right') contentArea.classList.add('slide-right');

		if (viewMode === 'year') {
			labelEl.setText(String(currentYear));
			prevBtn.addEventListener('click', () => { currentYear--; slideDirection = 'right'; render(); });
			nextBtn.addEventListener('click', () => {
				if (currentYear < today.getFullYear()) { currentYear++; slideDirection = 'left'; render(); }
			});
			if (currentYear >= today.getFullYear()) nextBtn.classList.add('disabled');
			renderYearView(contentArea, currentYear, dayMap, dayTaskMap, completionMap, dueDateSet, dueDateTasks, settings, today, getMaxMinutesInRange);
		} else {
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
	const totalHours = (totalMinutes / 60).toFixed(1);
	const statsEl = container.createEl('div', { cls: 'mikumodoro-heatmap-stats' });
	statsEl.setText(`${totalHours}h in ${year}`);

	const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

	const gridWrapper = container.createEl('div', { cls: 'mikumodoro-heatmap-grid-wrapper' });

	const labelsCol = gridWrapper.createEl('div', { cls: 'mikumodoro-heatmap-labels' });
	const dayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
	for (let i = 0; i < 7; i++) {
		labelsCol.createEl('div', {
			cls: 'mikumodoro-heatmap-day-label',
			text: i % 2 === 1 ? dayLabels[i] : '',
		});
	}

	const gridArea = gridWrapper.createEl('div', { cls: 'mikumodoro-heatmap-grid-area' });
	const monthLabelRow = gridArea.createEl('div', { cls: 'mikumodoro-heatmap-month-labels' });
	const grid = gridArea.createEl('div', { cls: 'mikumodoro-heatmap-grid' });

	const startDate = new Date(year, 0, 1);
	startDate.setDate(startDate.getDate() - startDate.getDay());

	let currentWeek = 0;
	const cursor = new Date(startDate);

	while (cursor <= yearEnd && currentWeek < 54) {
		const monthLabel = monthLabelRow.createEl('span', { cls: 'mikumodoro-heatmap-month-label' });
		const firstWeekDate = new Date(cursor);
		const prevWeekDate = new Date(cursor.getTime() - 7 * 86400000);
		if (firstWeekDate.getMonth() !== prevWeekDate.getMonth() || currentWeek === 0) {
			// Don't show Dec for the first week (it's from the previous year)
			const monthIdx = firstWeekDate.getMonth();
			if (currentWeek === 0 && monthIdx === 11) {
				monthLabel.setText('');
			} else {
				monthLabel.setText(monthLabels[monthIdx] ?? '');
			}
		}

		const weekCol = grid.createEl('div', { cls: 'mikumodoro-heatmap-week' });

		for (let d = 0; d < 7; d++) {
			const date = new Date(cursor);
			date.setDate(cursor.getDate() + d);

			const isInYear = date.getFullYear() === year;
			const dateStr = date.toISOString().slice(0, 10);
			const minutes = dayMap.get(dateStr) ?? 0;
			const completions = completionMap[dateStr]?.length ?? 0;
			const isFuture = date > today;
			const isToday = dateStr === today.toISOString().slice(0, 10);
			const hasDue = dueDateSet.has(dateStr);

			const cell = weekCol.createEl('div', { cls: 'mikumodoro-heatmap-cell' });

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

			if (isInYear && hasDue) {
				cell.classList.add('has-due');
			}

			if (isInYear && !isFuture && completions > 0) {
				cell.createEl('span', { cls: 'mikumodoro-completion-badge', text: String(completions) });
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
	const totalHours = (totalMinutes / 60).toFixed(1);
	const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
	const statsEl = container.createEl('div', { cls: 'mikumodoro-heatmap-stats' });
	statsEl.setText(`${totalHours}h in ${monthNames[month]} ${year}`);

	const dayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
	const headerRow = container.createEl('div', { cls: 'mikumodoro-heatmap-month-header' });
	for (const dl of dayLabels) {
		headerRow.createEl('div', { cls: 'mikumodoro-heatmap-month-day-label', text: dl });
	}

	const calGrid = container.createEl('div', { cls: 'mikumodoro-heatmap-month-grid' });
	const firstDayOfWeek = monthStart.getDay();
	for (let i = 0; i < firstDayOfWeek; i++) {
		calGrid.createEl('div', { cls: 'mikumodoro-heatmap-month-cell out-of-range' });
	}

	for (let day = 1; day <= monthEnd.getDate(); day++) {
		const date = new Date(year, month, day);
		const dateStr = date.toISOString().slice(0, 10);
		const minutes = dayMap.get(dateStr) ?? 0;
		const completions = completionMap[dateStr]?.length ?? 0;
		const isFuture = date > today;
		const isToday = dateStr === today.toISOString().slice(0, 10);
		const hasDue = dueDateSet.has(dateStr);

		const cell = calGrid.createEl('div', { cls: 'mikumodoro-heatmap-month-cell' });
		cell.createEl('span', { cls: 'mikumodoro-heatmap-month-day-num', text: String(day) });

		if (isFuture) {
			cell.classList.add('future');
		} else if (minutes > 0) {
			const intensity = Math.min(1, minutes / maxMinutes);
			cell.style.backgroundColor = interpolateColor(settings.heatmapColor, intensity);
		} else {
			cell.classList.add('empty');
		}

		if (hasDue) {
			cell.classList.add('has-due');
		}

		if (!isFuture && completions > 0) {
			cell.createEl('span', { cls: 'mikumodoro-completion-badge', text: String(completions) });
		}

		const dueTasks = dueDateTasks.get(dateStr) ?? [];
		const tooltipText = buildTooltip(dateStr, date, minutes, completions, hasDue, dueTasks, dayTaskMap);
		cell.setAttribute('data-tooltip', tooltipText);
		cell.classList.add('has-tooltip');

		if (isToday) cell.classList.add('today');
	}

	renderLegend(container, settings);
}

function buildTooltip(
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
				lines.push(`  +${sorted.length - 5} more`);
			}
		}
	} else {
		lines.push(dateLabel);
	}
	const extras: string[] = [];
	if (completions > 0) extras.push(`${completions} completed`);
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

function renderLegend(container: HTMLElement, settings: MikumodoroSettings) {
	const legend = container.createEl('div', { cls: 'mikumodoro-heatmap-legend' });
	legend.createEl('span', { cls: 'mikumodoro-heatmap-legend-label', text: 'Less' });
	for (let i = 0; i < 5; i++) {
		const intensity = i / 4;
		const swatch = legend.createEl('div', { cls: 'mikumodoro-heatmap-cell' });
		if (i === 0) {
			swatch.classList.add('empty');
		} else {
			swatch.style.backgroundColor = interpolateColor(settings.heatmapColor, intensity);
		}
	}
	legend.createEl('span', { cls: 'mikumodoro-heatmap-legend-label', text: 'More' });
}

function sumMinutesInRange(dayMap: Map<string, number>, start: Date, end: Date): number {
	let total = 0;
	const d = new Date(start);
	while (d <= end) {
		const key = d.toISOString().slice(0, 10);
		total += dayMap.get(key) ?? 0;
		d.setDate(d.getDate() + 1);
	}
	return total;
}

function formatMinutes(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h > 0 && m > 0) return `${h}h ${m}m`;
	if (h > 0) return `${h}h`;
	return `${m}m`;
}

function interpolateColor(hex: string, intensity: number): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	// Parse the CSS variable for base background color
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
