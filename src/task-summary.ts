import type { PomodoroSession, TodoistTask } from './types';

interface TaskLink {
	parentId: string | null;
	projectId: string;
	updatedAt: number;
}

export type TaskHistoryData = Record<string, TaskLink>;

export interface TaskSummary {
	count: number;
	activeMinutes: number;
	totalMinutes: number;
}

export class TaskHistory {
	private links: TaskHistoryData = {};

	constructor(data?: unknown) {
		this.merge(data);
	}

	serialize(): TaskHistoryData {
		return { ...this.links };
	}

	merge(data: unknown): boolean {
		if (!data || typeof data !== 'object') return false;
		let changed = false;
		for (const [id, value] of Object.entries(data)) {
			if (!value || typeof value !== 'object') continue;
			const link = value as Partial<TaskLink>;
			if ((link.parentId !== null && typeof link.parentId !== 'string')
				|| typeof link.projectId !== 'string'
				|| typeof link.updatedAt !== 'number' || !Number.isFinite(link.updatedAt)) continue;
			if (!this.links[id] || link.updatedAt > this.links[id].updatedAt) {
				this.links[id] = { parentId: link.parentId, projectId: link.projectId, updatedAt: link.updatedAt };
				changed = true;
			}
		}
		return changed;
	}

	remember(tasks: Array<Pick<TodoistTask, 'id' | 'parent_id' | 'project_id'>>, updatedAt = Date.now()): boolean {
		let changed = false;
		for (const task of tasks) {
			const old = this.links[task.id];
			const parentId = task.parent_id ?? null;
			if (old && old.updatedAt >= updatedAt) continue;
			this.links[task.id] = { parentId, projectId: task.project_id, updatedAt };
			changed = true;
		}
		return changed;
	}

	/** Active membership comes from the latest task list; completed links only retain ancestry. */
	summarize(tasks: TodoistTask[], sessions: PomodoroSession[]) {
		const links = { ...this.links };
		const active = new Set<string>();
		for (const task of tasks) {
			if (task.checked || task.completed_at) continue;
			active.add(task.id);
			links[task.id] = { parentId: task.parent_id ?? null, projectId: task.project_id, updatedAt: 0 };
		}
		const byTask = new Map<string, TaskSummary>();
		const byProject = new Map<string, TaskSummary>();
		const get = (map: Map<string, TaskSummary>, id: string): TaskSummary => {
			let summary = map.get(id);
			if (!summary) {
				summary = { count: 0, activeMinutes: 0, totalMinutes: 0 };
				map.set(id, summary);
			}
			return summary;
		};
		const ancestors = (id: string): string[] => {
			const chain: string[] = [];
			const seen = new Set<string>([id]);
			let parentId = links[id]?.parentId;
			while (parentId && !seen.has(parentId)) {
				chain.push(parentId);
				seen.add(parentId);
				parentId = links[parentId]?.parentId;
			}
			return chain;
		};
		for (const id of active) {
			get(byTask, id);
			for (const parentId of ancestors(id)) get(byTask, parentId).count++;
			const projectId = links[id]?.projectId;
			if (projectId) get(byProject, projectId).count++;
		}
		for (const session of sessions) {
			const minutes = session.durationMinutes;
			const activeMinutes = active.has(session.taskId) ? minutes : 0;
			for (const id of [session.taskId, ...ancestors(session.taskId)]) {
				const summary = get(byTask, id);
				summary.totalMinutes += minutes;
				summary.activeMinutes += activeMinutes;
			}
			const projectId = links[session.taskId]?.projectId;
			if (projectId) {
				const summary = get(byProject, projectId);
				summary.totalMinutes += minutes;
				summary.activeMinutes += activeMinutes;
			}
		}
		return { byTask, byProject };
	}
}
