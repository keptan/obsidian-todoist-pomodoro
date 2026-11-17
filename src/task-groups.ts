import type { TodoistTask } from './types';

/** Group every project member without depending on Todoist's response order. */
export function groupTasksByProject(tasks: TodoistTask[]) {
	const projectGroups = new Map<string, { projectName: string; tasks: TodoistTask[] }>();
	const standaloneTasks: TodoistTask[] = [];
	for (const task of tasks) {
		if (task.project_id && task.project_name !== 'Inbox') {
			let group = projectGroups.get(task.project_id);
			if (!group) {
				group = { projectName: task.project_name || task.project_id, tasks: [] };
				projectGroups.set(task.project_id, group);
			}
			group.tasks.push(task);
		} else if (!task.parent_id) {
			standaloneTasks.push(task);
		}
	}
	return { projectGroups, standaloneTasks };
}
