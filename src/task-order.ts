import type { TodoistTask } from './types';

export type TaskDropPlacement = 'before' | 'after';

function compareDefaultTaskOrder(a: TodoistTask, b: TodoistTask): number {
	const priorityDifference = (b.priority ?? 1) - (a.priority ?? 1);
	if (priorityDifference !== 0) return priorityDifference;

	const aDueDate = a.due?.date ?? '';
	const bDueDate = b.due?.date ?? '';
	if (aDueDate !== bDueDate) {
		if (!aDueDate) return 1;
		if (!bDueDate) return -1;
		return aDueDate.localeCompare(bDueDate);
	}
	return a.content.localeCompare(b.content);
}

export function sortTasksByViewOrder(tasks: TodoistTask[], taskOrder: string[]): TodoistTask[] {
	const orderById = new Map(taskOrder.map((id, index) => [id, index]));
	return [...tasks].sort((a, b) => {
		const aIndex = orderById.get(a.id);
		const bIndex = orderById.get(b.id);
		if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
		if (aIndex !== undefined) return -1;
		if (bIndex !== undefined) return 1;
		return compareDefaultTaskOrder(a, b);
	});
}

export function reorderTaskIds(
	orderedIds: string[],
	draggedId: string,
	targetId: string,
	placement: TaskDropPlacement,
): string[] {
	if (draggedId === targetId || !orderedIds.includes(draggedId) || !orderedIds.includes(targetId)) {
		return [...orderedIds];
	}

	const reordered = orderedIds.filter(id => id !== draggedId);
	const targetIndex = reordered.indexOf(targetId);
	reordered.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, draggedId);
	return reordered;
}

export function updateStoredTaskOrder(storedOrder: string[], reorderedSiblingIds: string[]): string[] {
	const siblingIds = new Set(reorderedSiblingIds);
	return [
		...storedOrder.filter(id => !siblingIds.has(id)),
		...reorderedSiblingIds,
	];
}
