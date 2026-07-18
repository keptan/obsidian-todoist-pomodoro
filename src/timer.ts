import { Notice } from 'obsidian';
import type { MikumodoroSettings, PomodoroSession, TodoistTask, TimerState } from './types';

type TimerCallback = (state: TimerState) => void;

export class TimerEngine {
	private state: TimerState = {
		mode: 'idle',
		task: null,
		startTime: null,
		elapsedMs: 0,
		pausedAt: null,
	};

	private intervalId: number | null = null;
	private callbacks: Set<TimerCallback> = new Set();
	private settings: MikumodoroSettings;
	private sessions: PomodoroSession[] = [];
	private onSessionComplete?: (session: PomodoroSession) => void;
	private onBreakStart?: () => void;
	private breakDurationMs = 0;

	constructor(settings: MikumodoroSettings) {
		this.settings = settings;
	}

	setSettings(settings: MikumodoroSettings) {
		this.settings = settings;
	}

	onStateChange(cb: TimerCallback) {
		this.callbacks.add(cb);
	}

	setOnSessionComplete(cb: (session: PomodoroSession) => void) {
		this.onSessionComplete = cb;
	}

	setOnBreakStart(cb: () => void) {
		this.onBreakStart = cb;
	}

	private notify() {
		for (const cb of this.callbacks) {
			cb({ ...this.state });
		}
	}

	private tick() {
		if (this.state.mode === 'working' || this.state.mode === 'break') {
			if (this.state.startTime) {
				this.state.elapsedMs = Date.now() - this.state.startTime;
				this.notify();

				// Auto-complete work session when duration is reached
				if (this.state.mode === 'working') {
					const workMs = this.settings.defaultWorkMinutes * 60000;
					if (this.state.elapsedMs >= workMs) {
						this.startBreak();
						return;
					}
				}

				if (this.state.mode === 'break' && this.breakDurationMs > 0) {
					if (this.state.elapsedMs >= this.breakDurationMs) {
						new Notice('Mikumodoro: Break over! Ready for the next session? (≧▽≦)');
						this.stop();
						return;
					}
				}
			}
		}
	}

	private startInterval() {
		if (this.intervalId !== null) return;
		this.intervalId = window.setInterval(() => this.tick(), 1000);
	}

	private stopInterval() {
		if (this.intervalId !== null) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	startWork(task: TodoistTask | null) {
		// If currently working or paused, record the partial session first
		if ((this.state.mode === 'working' || this.state.mode === 'paused') && this.state.task && this.state.startTime) {
			const endTime = this.state.mode === 'paused' ? (this.state.pausedAt ?? Date.now()) : Date.now();
			const durationMin = Math.max(1, Math.round((endTime - this.state.startTime) / 60000));
			if (durationMin >= 1) {
				const session: PomodoroSession = {
					id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
					taskId: this.state.task.id,
					taskContent: this.state.task.content,
					startTime: this.state.startTime,
					endTime,
					durationMinutes: durationMin,
					completed: false,
				};
				this.sessions.push(session);
				this.onSessionComplete?.(session);
			}
		}

		this.state = {
			mode: 'working',
			task,
			startTime: Date.now(),
			elapsedMs: 0,
			pausedAt: null,
		};
		this.startInterval();
		this.notify();
		const taskName = task ? task.content : 'No task';
		new Notice(`Mikumodoro: Working on "${taskName}"`);
	}

	startBreak() {
		// Record the completed work session
		if (this.state.task && this.state.startTime) {
			const durationMin = Math.max(1, Math.round((Date.now() - this.state.startTime) / 60000));
			if (durationMin >= 1) {
				const session: PomodoroSession = {
					id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
					taskId: this.state.task.id,
					taskContent: this.state.task.content,
					startTime: this.state.startTime,
					endTime: Date.now(),
					durationMinutes: durationMin,
					completed: true,
				};
				this.sessions.push(session);
				this.onSessionComplete?.(session);
			}
		}

		const workMs = this.state.startTime ? Date.now() - this.state.startTime : this.settings.defaultWorkMinutes * 60000;
		const breakMs = workMs / this.settings.breakRatio;
		this.breakDurationMs = breakMs;

		this.state = {
			mode: 'break',
			task: this.state.task,
			startTime: Date.now(),
			elapsedMs: 0,
			pausedAt: null,
		};

		this.startInterval();
		this.notify();

		// Fire break start callback (for sound/notifications)
		this.onBreakStart?.();

		const breakMin = Math.round(breakMs / 60000);
		new Notice(`Mikumodoro: Break for ~${breakMin} minutes`);
	}

	stop() {
		this.stopInterval();

		// If stopping during work or paused work, record partial session
		if ((this.state.mode === 'working' || this.state.mode === 'paused') && this.state.task && this.state.startTime) {
			const endTime = this.state.mode === 'paused' ? (this.state.pausedAt ?? Date.now()) : Date.now();
			const durationMin = Math.max(1, Math.round((endTime - this.state.startTime) / 60000));
			if (durationMin >= 1) {
				const session: PomodoroSession = {
					id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
					taskId: this.state.task.id,
					taskContent: this.state.task.content,
					startTime: this.state.startTime,
					endTime: endTime,
					durationMinutes: durationMin,
					completed: false,
				};
				this.sessions.push(session);
				this.onSessionComplete?.(session);
			}
		}

		this.breakDurationMs = 0;

		this.state = {
			mode: 'idle',
			task: null,
			startTime: null,
			elapsedMs: 0,
			pausedAt: null,
		};
		this.notify();
	}

	pause() {
		if (this.state.mode === 'working' || this.state.mode === 'break') {
			this.state.pausedAt = Date.now();
			this.state.mode = 'paused';
			this.stopInterval();
			this.notify();
		}
	}

	resume() {
		if (this.state.mode === 'paused' && this.state.pausedAt && this.state.startTime) {
			const pauseDuration = Date.now() - this.state.pausedAt;
			this.state.startTime += pauseDuration;
			this.state.pausedAt = null;
			// Resume into whatever mode we were in before pausing
			// (could be working or break, but we stored 'paused' so we need to figure it out)
			// For simplicity, resume as 'working' since that's the main use case
			this.state.mode = 'working';
			this.startInterval();
			this.notify();
		}
	}

	getState(): TimerState {
		return { ...this.state };
	}

	getSessions(): PomodoroSession[] {
		return [...this.sessions];
	}

	loadSessions(sessions: PomodoroSession[]) {
		this.sessions = [...sessions];
	}

	addManualSession(session: PomodoroSession) {
		this.sessions.push(session);
		this.onSessionComplete?.(session);
	}

	getElapsedMs(): number {
		if (this.state.startTime && (this.state.mode === 'working' || this.state.mode === 'break')) {
			return Date.now() - this.state.startTime;
		}
		return this.state.elapsedMs;
	}

	destroy() {
		this.stopInterval();
		this.callbacks.clear();
	}
}
