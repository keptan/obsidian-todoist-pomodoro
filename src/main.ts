import { Plugin, WorkspaceLeaf, Notice, requestUrl } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	MikumodoroSettings,
	PomodoroSession,
	TodoistTask,
	TaskNoteMap,
	CompletionMap,
} from './types';
import { MikumodoroSettingTab } from './settings';
import { TodoistClient } from './todoist';
import { TimerEngine } from './timer';
import { TimerView, TIMER_VIEW_TYPE } from './view';
import { renderHeatmap } from './heatmap';

export default class MikumodoroTimerPlugin extends Plugin {
	settings!: MikumodoroSettings;
	todoistClient!: TodoistClient;
	timerEngine!: TimerEngine;
	todoistConnected = false;
	private cachedTasks: TodoistTask[] = [];
	private selectedTask: TodoistTask | null = null;
	private taskNoteMap: TaskNoteMap = {};
	private completionMap: CompletionMap = {};
	private customActivityLabels: string[] = [];
	private heatmapElements: Set<HTMLElement> = new Set();
	private saveTimer: number | null = null;
	private savePending = false;
	private lastDataSignature = '';

	private scheduleSave(delayMs = 2000) {
		this.savePending = true;
		if (this.saveTimer !== null) return;
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			this.savePending = false;
			this.savePluginData();
		}, delayMs);
	}

	private startPeriodicSave() {
		// Save every 60s while timer is active
		return this.registerInterval(window.setInterval(() => {
			const state = this.timerEngine.getState();
			if (state.mode === 'working' || state.mode === 'break' || state.mode === 'paused') {
				this.scheduleSave(0);
			}
		}, 60 * 1000));
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

		// Save on state changes (start, pause, resume, stop, session complete)
		this.timerEngine.onStateChange(() => {
			this.scheduleSave();
		});

		// Save sessions when one completes
		this.timerEngine.setOnSessionComplete(() => {
			this.savePluginData();
			this.refreshHeatmaps();
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
		this.addRibbonIcon('timer', 'Mikumodoro Timer', () => {
			this.activateView();
		});

		// Status bar
		const statusBarItemEl = this.addStatusBarItem();
		const updateStatusBar = () => {
			const state = this.timerEngine.getState();
			const elapsed = this.timerEngine.getElapsedMs();
			if (state.mode === 'idle') {
				statusBarItemEl.setText('🍅 Mikumodoro');
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
			name: 'Open Mikumodoro Timer',
			callback: () => this.activateView(),
		});

		this.addCommand({
			id: 'start-work-session',
			name: 'Start work session',
			callback: () => {
				this.timerEngine.startWork(this.selectedTask);
				this.activateView();
			},
		});

		this.addCommand({
			id: 'stop-timer',
			name: 'Stop timer / Start break',
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
			name: 'Refresh Todoist tasks',
			callback: () => this.refreshTasks(),
		});

		this.addCommand({
			id: 'complete-task',
			name: 'Complete selected task',
			callback: () => this.completeSelectedTask(),
		});

		// Settings tab
		this.addSettingTab(new MikumodoroSettingTab(this.app, this));

		// Register code block processor for heatmap
		this.registerMarkdownCodeBlockProcessor('mikumodoro-heatmap', (source, el, _ctx) => {
			this.renderHeatmapBlock(el, source);
		});

		// Auto-refresh tasks on load
		if (this.settings.todoistApiToken) {
			this.refreshTasks();
		}

		// Auto-refresh tasks every 5 minutes
		this.registerInterval(window.setInterval(() => {
			if (this.settings.todoistApiToken) {
				this.refreshTasks();
			}
		}, 5 * 60 * 1000));

		// Periodic save while timer is active
		this.startPeriodicSave();

		// Periodic data reload from disk (only refresh views if data changed)
		this.registerInterval(window.setInterval(() => {
			this.reloadFromDisk();
		}, 60000));

		// Auto-fetch completed history on boot if we don't have it yet
		if (this.settings.todoistApiToken) {
			const hasHistory = Object.keys(this.completionMap).length > 0;
			if (!hasHistory) {
				console.log('Mikumodoro: No completion history found, fetching from Todoist...');
				this.syncCompletedHistory().catch(err => {
					console.error('Mikumodoro: Auto history fetch failed', err);
				});
			} else {
				// Still sync on boot for safekeeping (merge new completions)
				this.syncCompletedHistory().catch(err => {
					console.error('Mikumodoro: Boot history sync failed', err);
				});
			}
		}

		// Request notification permission if enabled
		if (this.settings.notificationsEnabled && 'Notification' in window) {
			Notification.requestPermission();
		}
	}

	async onunload() {
		// Flush any pending save before destroying
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		if (this.savePending) {
			await this.savePluginData();
			this.savePending = false;
		}
		this.timerEngine.destroy();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<MikumodoroSettings>,
		);
	}

	async saveSettings() {
		await this.savePluginData();
	}

	private async savePluginData() {
		await this.saveData({
			...this.settings,
			sessions: this.timerEngine.getSessions(),
			taskNotes: this.taskNoteMap,
			completions: this.completionMap,
			customActivityLabels: this.customActivityLabels,
		});
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
			workspace.revealLeaf(leaf);
		}
	}

	getCachedTasks(): TodoistTask[] {
		return this.cachedTasks;
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
			const dateStr = new Date().toISOString().slice(0, 10);
			if (!this.completionMap[dateStr]) {
				this.completionMap[dateStr] = [];
			}
			this.completionMap[dateStr].push({
				taskId: task.id,
				taskContent: task.content,
				timestamp: Date.now(),
			});
			await this.savePluginData();
			new Notice(`Completed: ${task.content}`);
			// Remove from cached tasks
			this.cachedTasks = this.cachedTasks.filter(t => t.id !== task.id);
			this.selectedTask = null;
			this.refreshHeatmaps();
		} catch (err) {
			console.error('Mikumodoro: Failed to complete task', err);
			new Notice('Failed to complete task');
		}
	}

	// Sync historical completed tasks from Todoist
	async syncCompletedHistory() {
		if (!this.settings.todoistApiToken) return;
		try {
			// Pull completed tasks from the sync API
			const completed = await this.todoistClient.getCompletedTasks();
			let count = 0;
			for (const item of completed) {
				const dateStr = new Date(item.completed_at).toISOString().slice(0, 10);
				if (!this.completionMap[dateStr]) {
					this.completionMap[dateStr] = [];
				}
				// Avoid duplicates
				const exists = this.completionMap[dateStr].some(c => c.taskId === item.task_id);
				if (!exists) {
					this.completionMap[dateStr].push({
						taskId: item.task_id,
						taskContent: item.content,
						timestamp: new Date(item.completed_at).getTime(),
					});
					count++;
				}
			}
			await this.savePluginData();
			console.log(`Mikumodoro: Synced ${count} completed tasks`);
			this.lastDataSignature = ''; // force heatmap refresh
			this.refreshHeatmaps();
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

	async addManualSession(label: string, durationMinutes: number, date: Date) {
		const session: PomodoroSession = {
			id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			taskId: `custom:${label}`,
			taskContent: label,
			startTime: date.getTime(),
			endTime: date.getTime() + durationMinutes * 60000,
			durationMinutes,
			completed: false,
		};
		this.timerEngine.addManualSession(session);
		if (!this.customActivityLabels.includes(label)) {
			this.customActivityLabels.push(label);
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
				new Notification('Mikumodoro', {
					body: 'Break time! Take a rest (≧▽≦)',
					icon: '🍅',
				});
			}
		}
	}

	private onBreakEnd() {
		if (this.settings.soundEnabled) {
			this.playChime();
		}
		if (this.settings.notificationsEnabled && 'Notification' in window) {
			if (Notification.permission === 'granted') {
				new Notification('Mikumodoro', {
					body: 'Break over! Back to work! (｡•̀ᴗ-)✧',
					icon: '🍅',
				});
			}
		}
	}

	private playChime() {
		try {
			// Use Web Audio API to generate a pleasant chime
			const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
			if (!AudioContext) return;
			const ctx = new AudioContext();

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
			setTimeout(() => ctx.close(), 1000);
		} catch (err) {
			console.error('Mikumodoro: Failed to play chime', err);
		}
	}

	private renderHeatmapBlock(el: HTMLElement, _source: string) {
		const wrapper = el.createEl('div', { cls: 'mikumodoro-heatmap-container' });
		renderHeatmap(wrapper, this.timerEngine.getSessions(), this.settings, this);
		this.heatmapElements.add(wrapper);
	}

	refreshHeatmaps() {
		const sessions = this.timerEngine.getSessions();
		const completions = this.getCompletionMap();
		const tasks = this.cachedTasks;
		const sig = `${sessions.length}|${sessions[sessions.length-1]?.id ?? ''}|${Object.keys(completions).length}|${tasks.length}`;
		if (sig === this.lastDataSignature) {
			// Data unchanged, skip re-render
			return;
		}
		this.lastDataSignature = sig;
		for (const el of this.heatmapElements) {
			if (el.isConnected) {
				el.empty();
				renderHeatmap(el, sessions, this.settings, this);
			} else {
				this.heatmapElements.delete(el);
			}
		}
	}

	async reloadFromDisk() {
		const data = await this.loadData();
		let changed = false;
		if (data?.sessions) {
			const state = this.timerEngine.getState();
			if (state.mode === 'idle') {
				const currentSessions = this.timerEngine.getSessions();
				if (data.sessions.length !== currentSessions.length ||
					(data.sessions.length > 0 && data.sessions[data.sessions.length-1]?.id !== currentSessions[currentSessions.length-1]?.id)) {
					this.timerEngine.loadSessions(data.sessions);
					changed = true;
				}
			}
		}
		if (data?.completions) {
			const newKeys = Object.keys(data.completions).length;
			const oldKeys = Object.keys(this.completionMap).length;
			if (newKeys !== oldKeys) {
				this.completionMap = data.completions;
				changed = true;
			}
		}
		if (data?.customActivityLabels) {
			if (data.customActivityLabels.length !== this.customActivityLabels.length) {
				this.customActivityLabels = data.customActivityLabels;
				changed = true;
			}
		}
		if (changed) {
			this.refreshHeatmaps();
			this.refreshViews();
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
