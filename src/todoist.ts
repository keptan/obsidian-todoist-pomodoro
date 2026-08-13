import { requestUrl } from 'obsidian';
import type { TodoistTask } from './types';

const API_BASE = 'https://api.todoist.com/api/v1';

interface PaginatedResponse<T> {
	results: T[];
	next_cursor: string | null;
}

export class TodoistClient {
	private token: string;

	constructor(token: string) {
		this.token = token;
	}

	setToken(token: string) {
		this.token = token;
	}

	private async request(path: string, method = 'GET', body?: unknown, expectsJson = true): Promise<unknown> {
		const headers: Record<string, string> = {
			'Authorization': `Bearer ${this.token}`,
		};
		if (body) {
			headers['Content-Type'] = 'application/json';
		}
		const response = await requestUrl({
			url: `${API_BASE}${path}`,
			method,
			headers,
			body: body ? JSON.stringify(body) : undefined,
		});
		return expectsJson ? response.json : undefined;
	}

	async getTasks(): Promise<TodoistTask[]> {
		if (!this.token) return [];
		const all: TodoistTask[] = [];
		let cursor: string | null = null;
		do {
			const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
			const data = await this.request(`/tasks${query}`) as PaginatedResponse<TodoistTask>;
			if (data.results) {
				all.push(...data.results);
			}
			cursor = data.next_cursor;
		} while (cursor);
		return all;
	}

	async getTask(id: string): Promise<TodoistTask> {
		return await this.request(`/tasks/${id}`) as TodoistTask;
	}

	async closeTask(id: string): Promise<void> {
		await this.request(`/tasks/${id}/close`, 'POST', undefined, false);
	}

	async createTask(content: string, parentId?: string, projectId?: string): Promise<TodoistTask> {
		const body: Record<string, unknown> = { content };
		if (parentId) body['parent_id'] = parentId;
		if (projectId) body['project_id'] = projectId;
		return await this.request('/tasks', 'POST', body) as TodoistTask;
	}

	async getProjects(): Promise<Record<string, string>> {
		const all: Array<{ id: string; name: string }> = [];
		let cursor: string | null = null;
		do {
			const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
			const data = await this.request(`/projects${query}`) as PaginatedResponse<{ id: string; name: string }>;
			if (data.results) {
				all.push(...data.results);
			}
			cursor = data.next_cursor;
		} while (cursor);
		const map: Record<string, string> = {};
		for (const p of all) {
			map[p.id] = p.name;
		}
		return map;
	}

	/**
	 * Fetch completed tasks using the sync API.
	 * Returns items with completed_at timestamps.
	 * Note: requires project_id filter on some accounts.
	 */
	async getCompletedTasks(since?: Date): Promise<Array<{ task_id: string; content: string; completed_at: string; project_id: string }>> {
		if (!this.token) return [];
		const rangeStart = since ?? new Date(Date.now() - 89 * 24 * 60 * 60 * 1000);
		const completed: Array<{ task_id: string; content: string; completed_at: string; project_id: string }> = [];
		let cursor: string | null = null;
		do {
			const params = new URLSearchParams({ since: rangeStart.toISOString(), limit: '50' });
			if (cursor) params.set('cursor', cursor);
			const response = await requestUrl({
				url: `${API_BASE}/tasks/completed/by_completion_date?${params.toString()}`,
				method: 'GET',
				headers: { 'Authorization': `Bearer ${this.token}` },
			});
			const data = response.json as {
				items?: Array<{ id: string; content: string; completed_at?: string; project_id?: string; is_deleted?: boolean }>;
				next_cursor?: string | null;
			};
			for (const item of data.items ?? []) {
				if (!item.completed_at || item.is_deleted) continue;
				completed.push({
					task_id: item.id,
					content: item.content,
					completed_at: item.completed_at,
					project_id: item.project_id ?? '',
				});
			}
			cursor = data.next_cursor ?? null;
		} while (cursor);
		return completed;
	}
}
