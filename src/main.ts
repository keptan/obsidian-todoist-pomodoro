import { Plugin, WorkspaceLeaf, Notice } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	MikumodoroSettings,
	PomodoroSession,
	TodoistTask,
	TaskNoteMap,
	CompletionMap,
	CompletionRecord,
	WorkoutRecord,
} from './types';
import { MikumodoroSettingTab } from './settings';
import { TodoistClient } from './todoist';
import { TimerEngine } from './timer';
import { TimerView, TIMER_VIEW_TYPE } from './view';
import { renderHeatmap } from './heatmap';
import { formatLocalDate, rollingYearWindow } from './utils';
import { DateRange, getDateRangesToSync, mergeDateRanges, SerializedSaveQueue } from './persistence';
import { removeTaskTree } from './task-cache';
import { parseCompletionSyncRecord, parseSessionSyncRecord, parseWorkoutSyncRecord } from './sync-records';
import { reorderTaskIds, TaskDropPlacement, updateStoredTaskOrder } from './task-order';

export default class MikumodoroTimerPlugin extends Plugin {
	settings!: MikumodoroSettings;
	todoistClient!: TodoistClient;
	timerEngine!: TimerEngine;
	todoistConnected = false;
	private cachedTasks: TodoistTask[] = [];
	private selectedTask: TodoistTask | null = null;
	private taskNoteMap: TaskNoteMap = {};
	private completionMap: CompletionMap = {};
	private completionHistoryCoverage: DateRange[] = [];
	private completionHistoryLoads = new Map<string, Promise<boolean>>();
	private customActivityLabels: string[] = [];
	private taskOrder: string[] = [];
	private workouts: WorkoutRecord[] = [];
	private heatmapElements: Set<HTMLElement> = new Set();
	private saveTimer: number | null = null;
	private saveQueue = new SerializedSaveQueue();
	private dateRolloverTimer: number | null = null;
	private seenSessionRecordFiles = new Set<string>();
	private seenCompletionRecordFiles = new Set<string>();
	private seenWorkoutRecordFiles = new Set<string>();
	private lastRecentCompletionSyncAt = 0;

	private scheduleSave(delayMs = 2000) {
		if (this.saveTimer !== null) return;
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void this.savePluginData().catch(err => {
				console.error('Mikumodoro: Scheduled save failed', err);
			});
		}, delayMs);
	}

	async onload() {
		await this.loadSettings();

		this.todoistClient = new TodoistClient(this.settings.todoistApiToken);
		this.timerEngine = new TimerEngine(this.settings);

		// Load saved data
		const savedData = (await this.loadData()) as {
			sessions?: PomodoroSession[];
			taskNotes?: TaskNoteMap;
			completions?: CompletionMap;
			customActivityLabels?: string[];
			taskOrder?: string[];
			workouts?: WorkoutRecord[];
			completionHistoryCoverage?: DateRange[];
		};
		if (savedData?.sessions) {
			this.timerEngine.loadSessions(savedData.sessions);
		}
		if (savedData?.taskNotes) {
			this.taskNoteMap = savedData.taskNotes;
		}
		if (savedData?.completions) {
			this.completionMap = savedData.completions;
		}
		if (savedData?.customActivityLabels) {
			this.customActivityLabels = savedData.customActivityLabels;
		}
		if (Array.isArray(savedData?.taskOrder)) {
			this.taskOrder = [...new Set(savedData.taskOrder.filter(id => typeof id === 'string'))];
		}
		if (Array.isArray(savedData?.workouts)) {
			this.workouts = savedData.workouts;
		}
		if (Array.isArray(savedData?.completionHistoryCoverage)) {
			this.completionHistoryCoverage = mergeDateRanges(savedData.completionHistoryCoverage);
		}

		// Merge immutable sync records from this and other devices.
		if (await this.mergeSyncRecords()) {
			this.scheduleSave(1000);
		}

		// Save sessions when one completes
		this.timerEngine.setOnSessionComplete((session) => {
			void this.persistSession(session).catch(err => {
				console.error('Mikumodoro: Failed to save completed session', err);
			});
			this.refreshHeatmaps();
		});

		this.timerEngine.setOnWorkLimitReached(() => {
			this.onWorkLimitReached();
		});

		// Break start callback: play chime + notification
		this.timerEngine.setOnBreakStart(() => {
			this.onBreakStart();
		});

		// Break end callback: play chime + notification
		this.timerEngine.setOnBreakEnd(() => {
			this.onBreakEnd();
		});

		// Register the timer view
		this.registerView(TIMER_VIEW_TYPE, (leaf) => new TimerView(leaf, this));

		// Ribbon icon
		this.addRibbonIcon('timer', 'Todoist pomodoro heatmap', () => {
			void this.activateView();
		});

		// Status bar
		const statusBarItemEl = this.addStatusBarItem();
		const updateStatusBar = () => {
			const state = this.timerEngine.getState();
			const elapsed = this.timerEngine.getElapsedMs();
			if (state.mode === 'idle') {
				statusBarItemEl.setText('🍅 Todoist pomodoro');
			} else {
				const min = Math.floor(elapsed / 60000);
				const sec = Math.floor((elapsed % 60000) / 1000);
				const timeStr = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
				const icon = state.mode === 'break' ? '☕' : '🍅';
				const taskName = state.task ? state.task.content.slice(0, 20) : '';
				statusBarItemEl.setText(`${icon} ${timeStr} ${taskName}`);
			}
		};
		this.timerEngine.onStateChange(updateStatusBar);
		this.registerInterval(window.setInterval(updateStatusBar, 1000));

		// Commands
		this.addCommand({
			id: 'open-timer-view',
			name: 'Open timer',
			callback: () => void this.activateView(),
		});

		this.addCommand({
			id: 'start-work-session',
			name: 'Start work session',
			callback: () => {
				this.timerEngine.startWork(this.selectedTask);
				void this.activateView();
			},
		});

		this.addCommand({
			id: 'stop-timer',
			name: 'Stop timer / start break',
			callback: () => {
				const state = this.timerEngine.getState();
				if (state.mode === 'working') {
					this.timerEngine.startBreak();
				} else if (state.mode === 'break' || state.mode === 'paused') {
					this.timerEngine.stop();
				}
			},
		});

		this.addCommand({
			id: 'pause-timer',
			name: 'Pause timer',
			callback: () => {
				this.timerEngine.pause();
			},
		});

		this.addCommand({
			id: 'refresh-tasks',
			name: 'Refresh todoist tasks',
			callback: () => void this.refreshTasks(),
		});

		this.addCommand({
			id: 'complete-task',
			name: 'Complete selected task',
			callback: () => void this.completeSelectedTask(),
		});

		// Settings tab
		this.addSettingTab(new MikumodoroSettingTab(this.app, this));

		// Register code block processor for heatmap
		this.registerMarkdownCodeBlockProcessor('mikumodoro-heatmap', (source, el, _ctx) => {
			this.renderHeatmapBlock(el, source);
		});

		// Auto-refresh tasks on load
		if (this.settings.todoistApiToken) {
			void this.refreshTasks();
		}

		// Auto-refresh tasks every 5 minutes
		this.registerInterval(window.setInterval(() => {
			if (this.settings.todoistApiToken) {
					void this.refreshTasks();
			}
		}, 5 * 60 * 1000));

		// Periodic data reload from disk (only refresh views if data changed)
		this.registerInterval(window.setInterval(() => {
			void this.reloadFromDisk();
		}, 60000));

		// Populate the default rolling year. Older periods load on navigation.
		if (this.settings.todoistApiToken) {
			void this.ensureCompletionHistoryForRollingYear(new Date().getFullYear()).catch(err => {
				console.error('Mikumodoro: Boot history sync failed', err);
			});
		}
		this.scheduleDateRollover();

		// Request notification permission if enabled
		if (this.settings.notificationsEnabled && 'Notification' in window) {
			void Notification.requestPermission();
		}
	}

	onunload() {
		void this.unloadAsync();
	}

	private async unloadAsync(): Promise<void> {
		// Flush any pending save before destroying
		const hadScheduledSave = this.saveTimer !== null;
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		if (this.dateRolloverTimer !== null) {
			window.clearTimeout(this.dateRolloverTimer);
			this.dateRolloverTimer = null;
		}
		if (hadScheduledSave) {
			await this.savePluginData();
		}
		await this.saveQueue.drain();
		this.timerEngine.destroy();
	}

	async loadSettings() {
		const savedData = (await this.loadData()) as Record<string, unknown> | null;
		const savedSettings = Object.fromEntries(
			Object.keys(DEFAULT_SETTINGS)
				.filter((key) => savedData?.[key] !== undefined)
				.map((key) => [key, savedData![key]]),
		) as Partial<MikumodoroSettings>;
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			savedSettings,
		);
	}

	async saveSettings() {
		await this.savePluginData();
	}

	private async savePluginData() {
		await this.saveQueue.enqueue(async () => {
			await this.saveData({
				...this.settings,
				sessions: this.timerEngine.getSessions(),
				taskNotes: this.taskNoteMap,
				completions: this.completionMap,
				customActivityLabels: this.customActivityLabels,
				taskOrder: this.taskOrder,
				workouts: this.workouts,
				completionHistoryCoverage: this.completionHistoryCoverage,
			});
		});
	}

	// --- Immutable records: conflict-safe transport for cross-device data ---

	private async ensureDir(dirPath: string): Promise<void> {
		const parts = dirPath.split('/');
		let current = '';
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			try {
				if (!(await this.app.vault.adapter.exists(current))) {
					await this.app.vault.adapter.mkdir(current);
				}
			} catch {
				// Directory might already exist, ignore
			}
		}
	}

	private async writeSessionRecord(session: PomodoroSession): Promise<void> {
		const dir = `${this.manifest.dir}/pending/sessions`;
		await this.ensureDir(dir);
		const filePath = `${dir}/${session.id}.json`;
		await this.app.vault.adapter.write(filePath, JSON.stringify(session));
		this.seenSessionRecordFiles.add(filePath);
	}

	private async persistSession(session: PomodoroSession): Promise<void> {
		try {
			await this.writeSessionRecord(session);
		} catch (err) {
			console.error('Mikumodoro: Failed to write session sync record', err);
		}
		await this.savePluginData();
	}

	private async writeCompletionRecord(dateStr: string, record: CompletionRecord): Promise<void> {
		const dir = `${this.manifest.dir}/pending/completions`;
		await this.ensureDir(dir);
		const filePath = `${dir}/${record.taskId}-${record.timestamp}.json`;
		const payload = { dateStr, ...record };
		await this.app.vault.adapter.write(filePath, JSON.stringify(payload));
		this.seenCompletionRecordFiles.add(filePath);
	}

	private async writeWorkoutRecord(record: WorkoutRecord): Promise<void> {
		const dir = `${this.manifest.dir}/pending/workouts`;
		await this.ensureDir(dir);
		const filePath = `${dir}/${record.id}.json`;
		await this.app.vault.adapter.write(filePath, JSON.stringify(record));
		this.seenWorkoutRecordFiles.add(filePath);
	}

	private async mergeSyncRecords(): Promise<boolean> {
		let changed = false;
		const sessionsDir = `${this.manifest.dir}/pending/sessions`;
		const completionsDir = `${this.manifest.dir}/pending/completions`;
		const workoutsDir = `${this.manifest.dir}/pending/workouts`;

		// Records stay on disk so every device can eventually receive them.
		try {
			if (await this.app.vault.adapter.exists(sessionsDir)) {
				const listing = await this.app.vault.adapter.list(sessionsDir);
				for (const file of listing.files) {
					if (this.seenSessionRecordFiles.has(file)) continue;
					try {
						const content = await this.app.vault.adapter.read(file);
						const session = parseSessionSyncRecord(content);
						changed = this.timerEngine.mergeSessions([session]) || changed;
						if (session.taskId.startsWith('custom:') && !this.customActivityLabels.includes(session.taskContent)) {
							this.customActivityLabels.push(session.taskContent);
							changed = true;
						}
						this.seenSessionRecordFiles.add(file);
					} catch (err) {
						console.error('Mikumodoro: Failed to merge session sync record', file, err);
					}
				}
			}
		} catch (err) {
			console.error('Mikumodoro: Failed to merge session sync records', err);
		}

		// Merge completion records using the same durable policy.
		try {
			if (await this.app.vault.adapter.exists(completionsDir)) {
				const listing = await this.app.vault.adapter.list(completionsDir);
				for (const file of listing.files) {
					if (this.seenCompletionRecordFiles.has(file)) continue;
					try {
						const content = await this.app.vault.adapter.read(file);
						const data = parseCompletionSyncRecord(content);
						const dateStr: string = data.dateStr;
						const record: CompletionRecord = {
							taskId: data.taskId,
							taskContent: data.taskContent,
							timestamp: data.timestamp,
						};
						if (!this.completionMap[dateStr]) {
							this.completionMap[dateStr] = [];
						}
						const exists = this.completionMap[dateStr].some(c => c.taskId === record.taskId);
						if (!exists) {
							this.completionMap[dateStr].push(record);
							changed = true;
						}
						this.seenCompletionRecordFiles.add(file);
					} catch (err) {
						console.error('Mikumodoro: Failed to merge completion sync record', file, err);
					}
				}
			}
		} catch (err) {
			console.error('Mikumodoro: Failed to merge completion sync records', err);
		}

		try {
			if (await this.app.vault.adapter.exists(workoutsDir)) {
				const listing = await this.app.vault.adapter.list(workoutsDir);
				const existingIds = new Set(this.workouts.map(record => record.id));
				for (const file of listing.files) {
					if (this.seenWorkoutRecordFiles.has(file)) continue;
					try {
						const record = parseWorkoutSyncRecord(await this.app.vault.adapter.read(file));
						if (!existingIds.has(record.id)) {
							this.workouts.push(record);
							existingIds.add(record.id);
							changed = true;
						}
						this.seenWorkoutRecordFiles.add(file);
					} catch (err) {
						console.error('Mikumodoro: Failed to merge workout sync record', file, err);
					}
				}
			}
		} catch (err) {
			console.error('Mikumodoro: Failed to merge workout sync records', err);
		}

		return changed;
	}

	async activateView() {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(TIMER_VIEW_TYPE);
		if (leaves.length > 0) {
			leaf = leaves[0]!;
		} else {
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({
					type: TIMER_VIEW_TYPE,
					active: true,
				});
			}
		}
		if (leaf) {
			void workspace.revealLeaf(leaf);
		}
	}

	getCachedTasks(): TodoistTask[] {
		return this.cachedTasks;
	}

	getTaskOrder(): string[] {
		return this.taskOrder;
	}

	async reorderTaskInView(
		siblingIds: string[],
		draggedId: string,
		targetId: string,
		placement: TaskDropPlacement,
	): Promise<boolean> {
		const reorderedIds = reorderTaskIds(siblingIds, draggedId, targetId, placement);
		if (reorderedIds.every((id, index) => id === siblingIds[index])) return false;

		const previousOrder = this.taskOrder;
		this.taskOrder = updateStoredTaskOrder(this.taskOrder, reorderedIds);
		this.refreshViews();
		try {
			await this.savePluginData();
			return true;
		} catch (err) {
			this.taskOrder = previousOrder;
			this.refreshViews();
			throw err;
		}
	}

	getSelectedTask(): TodoistTask | null {
		return this.selectedTask;
	}

	setSelectedTask(task: TodoistTask | null) {
		this.selectedTask = task;
	}

	clearCachedTasks() {
		this.cachedTasks = [];
		this.selectedTask = null;
	}

	async testTodoistConnection(): Promise<boolean> {
		if (!this.settings.todoistApiToken) return false;
		try {
			this.todoistClient.setToken(this.settings.todoistApiToken);
			const tasks = await this.todoistClient.getTasks();
			const projects = await this.todoistClient.getProjects();
			this.cachedTasks = tasks.map((t) => ({
				...t,
				project_name: projects[t.project_id],
			}));
			this.todoistConnected = true;
			this.refreshHeatmaps();
			return true;
		} catch (err) {
			console.error('Mikumodoro: Todoist connection test failed', err);
			this.todoistConnected = false;
			return false;
		}
	}

	async refreshTasks() {
		if (!this.settings.todoistApiToken) {
			return;
		}
		try {
			this.todoistClient.setToken(this.settings.todoistApiToken);
			const tasks = await this.todoistClient.getTasks();
			const projects = await this.todoistClient.getProjects();
			this.cachedTasks = tasks.map((t) => ({
				...t,
				project_name: projects[t.project_id],
			}));
			this.todoistConnected = true;
			this.refreshHeatmaps();
		} catch (err) {
			console.error('Mikumodoro: Failed to fetch Todoist tasks', err);
			this.todoistConnected = false;
		}
	}

	// Complete the selected task in Todoist and record completion
	async completeSelectedTask() {
		const task = this.selectedTask;
		if (!task) {
			new Notice('No task selected');
			return;
		}
		try {
			await this.todoistClient.closeTask(task.id);
			// Record completion
			const dateStr = formatLocalDate(new Date());
			if (!this.completionMap[dateStr]) {
				this.completionMap[dateStr] = [];
			}
			const completionRecord: CompletionRecord = {
				taskId: task.id,
				taskContent: task.content,
				timestamp: Date.now(),
			};
			this.completionMap[dateStr].push(completionRecord);
			await this.writeCompletionRecord(dateStr, completionRecord);
			await this.savePluginData();
			new Notice(`Completed: ${task.content}`);
			// Todoist closes a parent task's descendants too. Remove the full tree
			// locally so the UI reflects the confirmed completion immediately.
			this.cachedTasks = removeTaskTree(this.cachedTasks, task.id);
			this.selectedTask = null;
			this.refreshHeatmaps();
			this.refreshViews();
		} catch (err) {
			console.error('Mikumodoro: Failed to complete task', err);
			new Notice('Failed to complete task');
		}
	}

	async ensureCompletionHistoryForYear(year: number): Promise<boolean> {
		return this.ensureCompletionHistoryRange(new Date(year, 0, 1), new Date(year + 1, 0, 1));
	}

	async ensureCompletionHistoryForRollingYear(year: number): Promise<boolean> {
		const { start, end } = rollingYearWindow(year);
		const exclusiveEnd = new Date(end);
		exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
		return this.ensureCompletionHistoryRange(start, exclusiveEnd);
	}

	async ensureCompletionHistoryForMonth(year: number, month: number): Promise<boolean> {
		return this.ensureCompletionHistoryRange(new Date(year, month, 1), new Date(year, month + 1, 1));
	}

	private async ensureCompletionHistoryRange(start: Date, end: Date): Promise<boolean> {
		if (!this.settings.todoistApiToken) return false;
		const key = `${formatLocalDate(start)}:${formatLocalDate(end)}`;
		const existing = this.completionHistoryLoads.get(key);
		if (existing) {
			return existing;
		}

		const requested = { start: formatLocalDate(start), end: formatLocalDate(end) };
		const recentStart = new Date();
		recentStart.setHours(0, 0, 0, 0);
		recentStart.setDate(recentStart.getDate() - 2);
		const shouldRefreshRecent = Date.now() - this.lastRecentCompletionSyncAt >= 5 * 60 * 1000;
		const refreshFrom = shouldRefreshRecent ? formatLocalDate(recentStart) : undefined;
		const rangesToSync = getDateRangesToSync(
			requested,
			this.completionHistoryCoverage,
			refreshFrom,
		);
		if (rangesToSync.length === 0) return false;
		const load = (async () => {
			let changed = false;
			const previousCoverage = JSON.stringify(this.completionHistoryCoverage);
			for (const range of rangesToSync) {
				changed = await this.syncCompletedHistoryRange(
					new Date(`${range.start}T00:00:00`),
					new Date(`${range.end}T00:00:00`),
				) || changed;
				this.completionHistoryCoverage = mergeDateRanges([...this.completionHistoryCoverage, range]);
			}
			if (refreshFrom && refreshFrom < requested.end) {
				this.lastRecentCompletionSyncAt = Date.now();
			}
			if (changed || JSON.stringify(this.completionHistoryCoverage) !== previousCoverage) {
				await this.savePluginData();
			}
			return changed;
		})();
		this.completionHistoryLoads.set(key, load);
		try {
			return await load;
		} finally {
			this.completionHistoryLoads.delete(key);
		}
	}

	private async syncCompletedHistoryRange(start: Date, end: Date): Promise<boolean> {
		try {
			const completed = [];
			let changed = false;
			let chunkStart = new Date(start);
			while (chunkStart < end) {
				const chunkEnd = new Date(Math.min(end.getTime(), chunkStart.getTime() + 89 * 24 * 60 * 60 * 1000));
				completed.push(...await this.todoistClient.getCompletedTasks(chunkStart, chunkEnd));
				chunkStart = chunkEnd;
			}
			for (const item of completed) {
				const dateStr = formatLocalDate(new Date(item.completed_at));
				if (!this.completionMap[dateStr]) {
					this.completionMap[dateStr] = [];
				}
				// Avoid duplicates
				const exists = this.completionMap[dateStr].some(c => c.taskId === item.task_id);
				if (!exists) {
					const completionRecord: CompletionRecord = {
						taskId: item.task_id,
						taskContent: item.content,
						timestamp: new Date(item.completed_at).getTime(),
					};
					this.completionMap[dateStr].push(completionRecord);
					changed = true;
				}
			}
			return changed;
		} catch (err) {
			console.error('Mikumodoro: Failed to sync completed history', err);
			throw err;
		}
	}

	getCompletionsForDate(dateStr: string): number {
		return this.completionMap[dateStr]?.length ?? 0;
	}

	getCompletionMap(): CompletionMap {
		return this.completionMap;
	}

	getCustomActivityLabels(): string[] {
		return this.customActivityLabels;
	}

	getWorkoutRecords(): WorkoutRecord[] {
		return [...this.workouts];
	}

	async trackCustomActivity(label: string) {
		const fakeTask: TodoistTask = {
			id: `custom:${label}:${Date.now()}`,
			content: label,
			project_id: '',
			priority: 1,
		};
		this.setSelectedTask(fakeTask);
		if (!this.customActivityLabels.includes(label)) {
			this.customActivityLabels.push(label);
		}
		this.timerEngine.startWork(fakeTask);
		await this.savePluginData();
	}

	async addManualLog(label: string, durationMinutes: number, date: Date, pushUps: number, pullUps: number, dips: number) {
		if (label) {
			const session: PomodoroSession = {
				id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				taskId: `custom:${label}`,
				taskContent: label,
				startTime: date.getTime(),
				endTime: date.getTime() + durationMinutes * 60000,
				durationMinutes,
				completed: false,
				dateKey: formatLocalDate(date),
			};
			this.timerEngine.mergeSessions([session]);
			if (!this.customActivityLabels.includes(label)) {
				this.customActivityLabels.push(label);
			}
			try {
				await this.writeSessionRecord(session);
			} catch (err) {
				console.error('Mikumodoro: Failed to write session sync record', err);
			}
		}

		if (pushUps + pullUps + dips > 0) {
			const workout: WorkoutRecord = {
				id: `workout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				dateKey: formatLocalDate(date),
				timestamp: date.getTime(),
				pushUps,
				pullUps,
				dips,
			};
			this.workouts.push(workout);
			try {
				await this.writeWorkoutRecord(workout);
			} catch (err) {
				console.error('Mikumodoro: Failed to write workout sync record', err);
			}
		}

		await this.savePluginData();
		this.refreshHeatmaps();
		this.refreshViews();
	}

	// Get tasks that are due on a specific date (YYYY-MM-DD)
	getTasksDueOnDate(dateStr: string): TodoistTask[] {
		return this.cachedTasks.filter(t => {
			if (!t.due) return false;
			// due.date can be "2026-07-18" or "2026-07-18T12:00:00"
			return t.due.date.startsWith(dateStr);
		});
	}

	// Task time tracking
	getTaskMinutes(taskId: string): number {
		return this.timerEngine
			.getSessions()
			.filter((s) => s.taskId === taskId)
			.reduce((sum, s) => sum + s.durationMinutes, 0);
	}

	// Get task minutes including all subtasks (recursively)
	getTaskMinutesWithSubtasks(taskId: string): number {
		const allIds = [taskId, ...this.collectSubtaskIds(taskId)];
		return this.timerEngine
			.getSessions()
			.filter((s) => allIds.includes(s.taskId))
			.reduce((sum, s) => sum + s.durationMinutes, 0);
	}

	private collectSubtaskIds(parentId: string): string[] {
		const result: string[] = [];
		const directChildren = this.cachedTasks.filter(t => t.parent_id === parentId);
		for (const child of directChildren) {
			result.push(child.id);
			result.push(...this.collectSubtaskIds(child.id));
		}
		return result;
	}

	// Resolve a task ID to its top-level parent's content name
	getTopLevelTaskContent(taskId: string): string | null {
		let current = this.cachedTasks.find(t => t.id === taskId);
		if (!current) return null;
		while (current?.parent_id) {
			const parent = this.cachedTasks.find(t => t.id === current!.parent_id);
			if (!parent) break;
			current = parent;
		}
		return current?.content ?? null;
	}

	// Note linking
	getTaskNotePath(taskId: string): string | null {
		return this.taskNoteMap[taskId] ?? null;
	}

	async linkTaskNote(taskId: string, notePath: string) {
		this.taskNoteMap[taskId] = notePath;
		await this.savePluginData();
	}

	async unlinkTaskNote(taskId: string) {
		delete this.taskNoteMap[taskId];
		await this.savePluginData();
	}

	// Audio chime + notification on break start
	private onBreakStart() {
		// Play chime
		if (this.settings.soundEnabled) {
			this.playChime();
		}
		// System notification
		if (this.settings.notificationsEnabled && 'Notification' in window) {
			if (Notification.permission === 'granted') {
				new Notification('Todoist Pomodoro Heatmap', {
					body: 'Break time! Take a rest (≧▽≦)',
					icon: '🍅',
				});
			}
		}
	}

	private onWorkLimitReached() {
		if (this.settings.soundEnabled) {
			this.playChime();
		}
		if (this.settings.notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
			new Notification('Todoist Pomodoro Heatmap', {
				body: 'Work target reached! Keep going or take a break when ready. (≧▽≦)',
				icon: '🍅',
			});
		}
	}

	private onBreakEnd() {
		if (this.settings.soundEnabled) {
			this.playChime();
		}
		if (this.settings.notificationsEnabled && 'Notification' in window) {
			if (Notification.permission === 'granted') {
				new Notification('Todoist Pomodoro Heatmap', {
					body: 'Break over! Back to work! (｡•̀ᴗ-)✧',
					icon: '🍅',
				});
			}
		}
	}

	private playChime() {
		try {
			// Use Web Audio API to generate a pleasant chime
			const AudioContextClass = window.AudioContext
				?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
			if (!AudioContextClass) return;
			const ctx = new AudioContextClass();

			// Play a pleasant two-tone chime
			const notes = [
				{ freq: 880, delay: 0, duration: 0.15 }, // A5
				{ freq: 1320, delay: 0.12, duration: 0.2 }, // E6
				{ freq: 1760, delay: 0.24, duration: 0.3 }, // A6
			];

			for (const note of notes) {
				const osc = ctx.createOscillator();
				const gain = ctx.createGain();
				osc.connect(gain);
				gain.connect(ctx.destination);
				osc.frequency.value = note.freq;
				osc.type = 'sine';
				gain.gain.setValueAtTime(0, ctx.currentTime + note.delay);
				gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + note.delay + 0.02);
				gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + note.delay + note.duration);
				osc.start(ctx.currentTime + note.delay);
				osc.stop(ctx.currentTime + note.delay + note.duration);
			}

			// Close context after chime finishes
			window.setTimeout(() => void ctx.close(), 1000);
		} catch (err) {
			console.error('Mikumodoro: Failed to play chime', err);
		}
	}

	private renderHeatmapBlock(el: HTMLElement, _source: string) {
		const wrapper = el.createDiv({ cls: 'mikumodoro-heatmap-container' });
		renderHeatmap(wrapper, this.timerEngine.getSessions(), this.settings, this);
		this.heatmapElements.add(wrapper);
	}

	refreshHeatmaps() {
		const sessions = this.timerEngine.getSessions();
		for (const el of this.heatmapElements) {
			if (el.isConnected) {
				el.empty();
				renderHeatmap(el, sessions, this.settings, this);
			} else {
				this.heatmapElements.delete(el);
			}
		}
	}

	private scheduleDateRollover(): void {
		if (this.dateRolloverTimer !== null) window.clearTimeout(this.dateRolloverTimer);
		const now = new Date();
		const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
		this.dateRolloverTimer = window.setTimeout(() => {
			this.dateRolloverTimer = null;
			this.refreshHeatmaps();
			this.refreshViews();
			this.scheduleDateRollover();
		}, nextDay.getTime() - now.getTime());
	}

	async reloadFromDisk() {
		// Bypass Obsidian's loadData() cache to see changes from Obsidian Sync
		let rawData = '';
		try {
			const dataPath = `${this.manifest.dir}/data.json`;
			if (await this.app.vault.adapter.exists(dataPath)) {
				rawData = await this.app.vault.adapter.read(dataPath);
			}
		} catch (err) {
			console.error('Mikumodoro: Failed to read data.json from disk', err);
		}
		let data: {
			sessions?: PomodoroSession[];
			completions?: CompletionMap;
			taskNotes?: TaskNoteMap;
			customActivityLabels?: string[];
			taskOrder?: string[];
			workouts?: WorkoutRecord[];
			completionHistoryCoverage?: DateRange[];
		};
		try {
			data = (rawData ? JSON.parse(rawData) : {}) as typeof data;
		} catch (err) {
			console.error('Mikumodoro: Failed to parse data.json', err);
			data = {};
		}
		if (!data) return;
		let changed = false;

		// --- Sessions: merge by ID, works even during active timer ---
		if (data.sessions && Array.isArray(data.sessions)) {
			const currentSessions = this.timerEngine.getSessions();
			const currentIds = new Set(currentSessions.map(s => s.id));
			const newSessions = data.sessions.filter((s: PomodoroSession) => !currentIds.has(s.id));
			if (newSessions.length > 0) {
				// Use merge (safe during active timer) instead of load (which replaces)
				this.timerEngine.mergeSessions(data.sessions);
				changed = true;
			}
		}

		// --- Completions: deep merge by date + taskId ---
		if (data.completions && typeof data.completions === 'object') {
			const diskCompletions = data.completions;
			for (const dateStr of Object.keys(diskCompletions)) {
				const diskRecords = diskCompletions[dateStr] ?? [];
				const localRecords = this.completionMap[dateStr] ?? [];
				const localTaskIds = new Set(localRecords.map(r => r.taskId));
				for (const rec of diskRecords) {
					if (!localTaskIds.has(rec.taskId)) {
						if (!this.completionMap[dateStr]) {
							this.completionMap[dateStr] = [];
						}
						this.completionMap[dateStr].push(rec);
						changed = true;
					}
				}
			}
		}

		// --- Task notes: deep merge by taskId ---
		if (data.taskNotes && typeof data.taskNotes === 'object') {
			const diskNotes = data.taskNotes;
			for (const taskId of Object.keys(diskNotes)) {
				const diskPath = diskNotes[taskId];
				if (diskPath && this.taskNoteMap[taskId] !== diskPath) {
					this.taskNoteMap[taskId] = diskPath;
					changed = true;
				}
			}
		}

		// --- Custom activity labels: merge by value ---
		if (data.customActivityLabels && Array.isArray(data.customActivityLabels)) {
			const diskLabels = data.customActivityLabels;
			for (const label of diskLabels) {
				if (!this.customActivityLabels.includes(label)) {
					this.customActivityLabels.push(label);
					changed = true;
				}
			}
		}

		if (Array.isArray(data.taskOrder)) {
			const diskOrder = [...new Set(data.taskOrder.filter(id => typeof id === 'string'))];
			if (JSON.stringify(diskOrder) !== JSON.stringify(this.taskOrder)) {
				this.taskOrder = diskOrder;
				changed = true;
			}
		}

		if (Array.isArray(data.workouts)) {
			const existingIds = new Set(this.workouts.map(record => record.id));
			for (const record of data.workouts) {
				if (!existingIds.has(record.id)) {
					this.workouts.push(record);
					existingIds.add(record.id);
					changed = true;
				}
			}
		}

		if (Array.isArray(data.completionHistoryCoverage)) {
			const mergedCoverage = mergeDateRanges([
				...this.completionHistoryCoverage,
				...data.completionHistoryCoverage,
			]);
			if (JSON.stringify(mergedCoverage) !== JSON.stringify(this.completionHistoryCoverage)) {
				this.completionHistoryCoverage = mergedCoverage;
				changed = true;
			}
		}

		// Also merge immutable records synced from other devices.
		if (await this.mergeSyncRecords()) {
			changed = true;
		}

		if (changed) {
			this.refreshHeatmaps();
			this.refreshViews();
			// Persist merged data back to disk so the other device's writes
			// aren't lost on the next save from this device
			this.scheduleSave(1000);
		}
	}

	refreshViews() {
		for (const leaf of this.app.workspace.getLeavesOfType(TIMER_VIEW_TYPE)) {
			const view = leaf.view;
			if (view instanceof TimerView) {
				view.refresh();
			}
		}
	}
}
