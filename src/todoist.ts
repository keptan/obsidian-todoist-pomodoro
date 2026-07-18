import { requestUrl } from 'obsidian';
import type { TodoistTask } from './types';

const API_BASE = 'https://api.todoist.com/api/v1';
const SYNC_BASE = 'https://api.todoist.com/api/v1/sync';

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

	private async request(path: string, method = 'GET', body?: unknown): Promise<unknown> {
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
		return response.json;
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
		await this.request(`/tasks/${id}/close`, 'POST');
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
		try {
			const params: Record<string, string> = {
				sync_token: '*',
				resource_types: JSON.stringify(['items']),
			};
			if (since) {
				params.since = since.toISOString();
			}
			const body = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
			const response = await requestUrl({
				url: `${SYNC_BASE}`,
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.token}`,
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body,
			});
			const data = response.json as { items?: Array<{ id: string; content: string; completed_at?: string; checked?: boolean; is_deleted?: boolean }> };
			if (!data.items) return [];
			return data.items
				.filter(item => item.completed_at && !item.is_deleted)
				.map(item => ({
					task_id: item.id,
					content: item.content,
					completed_at: item.completed_at!,
					project_id: '',
				}));
		} catch (err) {
			console.error('Mikumodoro: Failed to fetch completed tasks', err);
			return [];
		}
	}
}
