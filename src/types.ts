export interface MikumodoroSettings {
	todoistApiToken: string;
	defaultWorkMinutes: number;
	breakRatio: number; // break = work / breakRatio
	autoStartBreak: boolean;
	heatmapColor: string;
	heatmapViewMode: 'year' | 'month';
	soundEnabled: boolean;
	notificationsEnabled: boolean;
	sessionsHeight: number;
}

export const DEFAULT_SETTINGS: MikumodoroSettings = {
	todoistApiToken: '',
	defaultWorkMinutes: 25,
	breakRatio: 5,
	autoStartBreak: true,
	heatmapColor: '#7c3aed',
	heatmapViewMode: 'year',
	soundEnabled: true,
	notificationsEnabled: true,
	sessionsHeight: 0,
};

export interface TodoistTask {
	id: string;
	content: string;
	project_id: string;
	project_name?: string;
	parent_id?: string | null;
	section_id?: string | null;
	due?: {
		date: string;
		timezone: string | null;
		string: string;
		lang: string;
		is_recurring: boolean;
	};
	priority: number;
	url?: string;
	description?: string;
	labels?: string[];
	added_at?: string;
	completed_at?: string | null;
	checked?: boolean;
	is_collapsed?: boolean;
	child_order?: number;
	note_count?: number;
	duration?: { amount: number; unit: string } | null;
	deadline?: { date: string; lang: string } | null;
}

export interface PomodoroSession {
	id: string;
	taskId: string;
	taskContent: string;
	startTime: number;
	endTime: number;
	durationMinutes: number;
	completed: boolean;
}

export interface TimerState {
	mode: 'idle' | 'working' | 'break' | 'paused';
	task: TodoistTask | null;
	startTime: number | null;
	elapsedMs: number;
	pausedAt: number | null;
}

// Note links: taskId -> obsidian note path
export type TaskNoteMap = Record<string, string>;

// Completion tracking: date string (YYYY-MM-DD) -> array of {taskId, taskContent}
export interface CompletionRecord {
	taskId: string;
	taskContent: string;
	timestamp: number;
}
export type CompletionMap = Record<string, CompletionRecord[]>;
