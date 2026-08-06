import type { TodoistTask } from './types';

/** Remove a completed task and every descendant Todoist closes with it. */
export function removeTaskTree(tasks: TodoistTask[], completedTaskId: string): TodoistTask[] {
	const removedIds = new Set<string>([completedTaskId]);
	let foundDescendant = true;

	while (foundDescendant) {
		foundDescendant = false;
		for (const task of tasks) {
			if (task.parent_id && removedIds.has(task.parent_id) && !removedIds.has(task.id)) {
				removedIds.add(task.id);
				foundDescendant = true;
			}
		}
	}

	return tasks.filter(task => !removedIds.has(task.id));
}
