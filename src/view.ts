import { ItemView, WorkspaceLeaf, Notice, Modal, setIcon } from 'obsidian';
import type MikumodoroTimerPlugin from './main';
import type { TodoistTask } from './types';
import { formatTimerDisplay } from './utils';

export const TIMER_VIEW_TYPE = 'obsidian-todoist-pomodoro-view';

export class TimerView extends ItemView {
	plugin: MikumodoroTimerPlugin;
	private renderBound: () => void;
	private expandedTasks: Set<string> = new Set();
	private expandedProjects: Set<string> = new Set();
	private lastRenderDate: string = '';

	constructor(leaf: WorkspaceLeaf, plugin: MikumodoroTimerPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.renderBound = () => this.render();
	}

	getViewType(): string {
		return TIMER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Mikumodoro Timer';
	}

	getIcon(): string {
		return 'timer';
	}

	async onOpen() {
		this.plugin.timerEngine.onStateChange(this.renderBound);
		this.render();

		// Periodic re-render for day rollover
		this.registerInterval(window.setInterval(() => {
			const today = new Date().toISOString().slice(0, 10);
			if (today !== this.lastRenderDate) {
				this.render();
			}
		}, 30000));
	}

	onClose(): Promise<void> {
		return Promise.resolve();
	}

	refresh() {
		this.render();
	}

	private render() {
		const { containerEl } = this;
		containerEl.empty();
		this.lastRenderDate = new Date().toISOString().slice(0, 10);

		const state = this.plugin.timerEngine.getState();

		// Scrollable content area (everything except bottom actions)
		const scrollContent = containerEl.createEl('div', { cls: 'mikumodoro-scroll-content' });

		// Timer row: display + mute toggle
		const timerRow = scrollContent.createEl('div', { cls: 'mikumodoro-timer-row' });

		const timerDisplay = timerRow.createEl('div', { cls: 'mikumodoro-timer-display' });
		const elapsedMs = this.plugin.timerEngine.getElapsedMs();
		timerDisplay.setText(formatTimerDisplay(elapsedMs));

		if (state.mode === 'working') {
			timerDisplay.classList.add('working');
		} else if (state.mode === 'break') {
			timerDisplay.classList.add('break');
		} else if (state.mode === 'paused') {
			timerDisplay.classList.add('paused');
		}

		// Mute toggle button next to timer
		const muteBtn = timerRow.createEl('button', { cls: 'mikumodoro-mute-btn' });
		setIcon(muteBtn, this.plugin.settings.soundEnabled ? 'volume-2' : 'volume-x');
		muteBtn.setAttribute('aria-label', this.plugin.settings.soundEnabled ? 'Mute chime' : 'Unmute chime');
		muteBtn.addEventListener('click', async () => {
			this.plugin.settings.soundEnabled = !this.plugin.settings.soundEnabled;
			await this.plugin.saveSettings();
			this.render();
		});

		// Current task
		const selected = this.plugin.getSelectedTask();
		if (state.task) {
			const taskEl = scrollContent.createEl('div', { cls: 'mikumodoro-current-task' });
			taskEl.createEl('span', { text: '🎯 ', cls: 'mikumodoro-task-icon' });
			taskEl.createEl('span', { text: state.task.content, cls: 'mikumodoro-task-name' });
		} else if (selected) {
			const taskEl = scrollContent.createEl('div', { cls: 'mikumodoro-current-task' });
			taskEl.createEl('span', { text: '🎯 ', cls: 'mikumodoro-task-icon' });
			taskEl.createEl('span', { text: selected.content, cls: 'mikumodoro-task-name' });
		}

		// Controls
		const controls = scrollContent.createEl('div', { cls: 'mikumodoro-controls' });

		if (state.mode === 'idle') {
			const startBtn = controls.createEl('button', {
				cls: 'mikumodoro-btn mikumodoro-btn-primary',
				text: 'Start Work',
			});
			startBtn.addEventListener('click', () => {
				const task = this.plugin.getSelectedTask();
				if (!task) {
					this.openTaskPicker();
				} else {
					this.plugin.timerEngine.startWork(task);
				}
			});

			this.renderTaskSelector(scrollContent);
		} else if (state.mode === 'working') {
			const stopBtn = controls.createEl('button', {
				cls: 'mikumodoro-btn mikumodoro-btn-stop',
				text: 'End Session',
			});
			stopBtn.addEventListener('click', () => {
				this.plugin.timerEngine.startBreak();
			});

			const pauseBtn = controls.createEl('button', {
				cls: 'mikumodoro-btn mikumodoro-btn-secondary',
				text: 'Pause',
			});
			pauseBtn.addEventListener('click', () => {
				this.plugin.timerEngine.pause();
			});
		} else if (state.mode === 'break') {
			const skipBtn = controls.createEl('button', {
				cls: 'mikumodoro-btn mikumodoro-btn-secondary',
				text: 'Skip Break',
			});
			skipBtn.addEventListener('click', () => {
				this.plugin.timerEngine.stop();
			});

			const extendBtn = controls.createEl('button', {
				cls: 'mikumodoro-btn mikumodoro-btn-secondary',
				text: '🏋️ Double Break',
			});
			extendBtn.addEventListener('click', () => {
				this.plugin.timerEngine.extendBreak(2);
			});
		} else if (state.mode === 'paused') {
			const resumeBtn = controls.createEl('button', {
				cls: 'mikumodoro-btn mikumodoro-btn-primary',
				text: 'Resume',
			});
			resumeBtn.addEventListener('click', () => {
				this.plugin.timerEngine.resume();
			});

			const stopBtn = controls.createEl('button', {
				cls: 'mikumodoro-btn mikumodoro-btn-stop',
				text: 'Stop',
			});
			stopBtn.addEventListener('click', () => {
				this.plugin.timerEngine.stop();
			});
		}

		// Today's sessions
		this.renderSessionsList(scrollContent);

		// Bottom action bar (always visible, outside scroll area)
		this.renderBottomActions(containerEl);
	}

	private renderTaskSelector(container: HTMLElement) {
		const tasks = this.plugin.getCachedTasks();
		if (tasks.length === 0) {
			container.createEl('div', {
				cls: 'mikumodoro-no-tasks',
				text: 'No Todoist tasks found. Add your API token in settings.',
			});

			// Refresh button in empty state
			const refreshBtn = container.createEl('button', {
				cls: 'mikumodoro-btn mikumodoro-btn-secondary',
				text: 'Refresh Tasks',
			});
			refreshBtn.addEventListener('click', async () => {
				refreshBtn.setText('Loading...');
				await this.plugin.refreshTasks();
				this.render();
			});
			return;
		}

		const sectionEl = container.createEl('div', { cls: 'mikumodoro-task-selector' });

		// Header row with label and refresh icon
		const headerRow = sectionEl.createEl('div', { cls: 'mikumodoro-task-selector-header' });
		headerRow.createEl('div', { text: 'Tasks', cls: 'mikumodoro-section-label' });

		const refreshIcon = headerRow.createEl('span', {
			cls: 'mikumodoro-refresh-icon',
			attr: { 'aria-label': 'Refresh tasks' },
		});
		refreshIcon.setText('⟳');
		refreshIcon.addEventListener('click', async () => {
			refreshIcon.classList.add('spinning');
			await this.plugin.refreshTasks();
			refreshIcon.classList.remove('spinning');
			this.render();
		});

		const listEl = sectionEl.createEl('div', { cls: 'mikumodoro-task-list' });

		// Group tasks: project tasks by project_id, standalone top-level tasks separately
		const projectGroups = new Map<string, { projectName: string; tasks: TodoistTask[] }>();
		const standaloneTasks: TodoistTask[] = [];

		for (const task of tasks) {
			const isInbox = task.project_name === 'Inbox';
			if (task.project_id && !isInbox && !task.parent_id) {
				// Real project, top-level task
				if (!projectGroups.has(task.project_id)) {
					projectGroups.set(task.project_id, {
						projectName: task.project_name || task.project_id,
						tasks: [],
					});
				}
				projectGroups.get(task.project_id)!.tasks.push(task);
			} else if (task.parent_id) {
				// Subtask: route to same group as parent
				const parent = tasks.find(t => t.id === task.parent_id);
				if (!parent) continue;
				const parentIsInbox = parent.project_name === 'Inbox';
				const parentIsStandalone = !parent.project_id || parentIsInbox;
				if (parentIsStandalone) {
					// Parent is standalone/inbox, ensure parent is in standaloneTasks
					if (!standaloneTasks.includes(parent)) {
						standaloneTasks.push(parent);
					}
				} else if (parent.project_id) {
					// Parent is in a real project, add subtask to that group
					const grp = projectGroups.get(parent.project_id);
					if (grp && !grp.tasks.includes(task)) {
						grp.tasks.push(task);
					}
				}
			} else {
				// Top-level task with no project or inbox = standalone
				standaloneTasks.push(task);
			}
		}

		// Sort projects alphabetically
		const sortedProjects = [...projectGroups.entries()].sort((a, b) =>
			a[1].projectName.localeCompare(b[1].projectName)
		);

		// Render project groups
		for (const [, group] of sortedProjects) {
			const topLevelTasks = group.tasks.filter(t => !t.parent_id);
			if (topLevelTasks.length === 0) continue;

			// Project header (collapsible)
			const projectHeader = listEl.createEl('div', { cls: 'mikumodoro-project-header' });
			const projectArrow = projectHeader.createEl('span', { cls: 'mikumodoro-project-arrow' });
			projectArrow.setText('▾');
			projectHeader.createEl('span', { text: group.projectName, cls: 'mikumodoro-project-name' });
			projectHeader.createEl('span', { cls: 'mikumodoro-project-count', text: String(topLevelTasks.length) });

			// Header action buttons
			const headerActions = projectHeader.createEl('div', { cls: 'mikumodoro-header-actions' });
			const addTaskBtn = headerActions.createEl('button', {
				cls: 'mikumodoro-header-action-btn',
				attr: { 'aria-label': 'Add task' },
			});
			addTaskBtn.setText('＋');
			addTaskBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.openTaskCreator(group.projectName, tasks);
			});

			const projectContent = listEl.createEl('div', { cls: 'mikumodoro-project-content' });
			const projectId = group.projectName;
			// Default to expanded unless explicitly collapsed
			if (this.expandedProjects.has('__collapsed__' + projectId)) {
				projectContent.style.display = 'none';
				projectArrow.setText('▸');
			}

			const sortedTasks = sortTasks(topLevelTasks);
			for (const task of sortedTasks.slice(0, 50)) {
				this.renderTaskItem(projectContent, task, group.tasks, 0);
			}

			projectHeader.addEventListener('click', () => {
				const isExpanded = !this.expandedProjects.has('__collapsed__' + projectId);
				if (isExpanded) {
					this.expandedProjects.add('__collapsed__' + projectId);
					projectArrow.setText('▸');
					projectContent.style.display = 'none';
				} else {
					this.expandedProjects.delete('__collapsed__' + projectId);
					projectArrow.setText('▾');
					projectContent.style.display = '';
				}
			});
		}

		// Render standalone top-level tasks (no project) as headers
		const sortedStandalone = sortTasks(standaloneTasks);
		for (const task of sortedStandalone) {
			this.renderTaskAsHeader(listEl, task, tasks);
		}
	}

	private autoExpandParents(task: TodoistTask, allTasks: TodoistTask[]) {
		let current: TodoistTask | undefined = task;
		while (current?.parent_id) {
			this.expandedTasks.add(current.parent_id);
			current = allTasks.find(t => t.id === current!.parent_id);
		}
	}

	private renderTaskAsHeader(listEl: HTMLElement, task: TodoistTask, allTasks: TodoistTask[]) {
		const subtasks = allTasks.filter(t => t.parent_id === task.id);
		const taskKey = 'standalone_' + task.id;

		// Header (same style as project header)
		const header = listEl.createEl('div', { cls: 'mikumodoro-project-header' });
		const arrow = header.createEl('span', { cls: 'mikumodoro-project-arrow' });
		arrow.setText('▾');
		header.createEl('span', { text: task.content, cls: 'mikumodoro-project-name' });
		header.createEl('span', { cls: 'mikumodoro-project-count', text: String(subtasks.length) });

		// Header action buttons: + subtask, link note
		const headerActions = header.createEl('div', { cls: 'mikumodoro-header-actions' });

		const addSubBtn = headerActions.createEl('button', {
			cls: 'mikumodoro-header-action-btn',
			attr: { 'aria-label': 'Add subtask' },
		});
		addSubBtn.setText('＋');
		addSubBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.openSubtaskCreator(task);
		});

		const notePath = this.plugin.getTaskNotePath(task.id);
		if (notePath) {
			const openNoteBtn = headerActions.createEl('button', {
				cls: 'mikumodoro-header-action-btn',
				attr: { 'aria-label': 'Open linked note' },
			});
			openNoteBtn.setText('📂');
			openNoteBtn.addEventListener('click', (e) => {
				e.stopPropagation();
			this.app.workspace.openLinkText(notePath, '', false);
			});
		} else {
			const linkBtn = headerActions.createEl('button', {
				cls: 'mikumodoro-header-action-btn',
				attr: { 'aria-label': 'Link note' },
			});
			linkBtn.setText('🔗');
			linkBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.openNoteLinker(task);
			});
		}

		// Click header name to select the task itself
		header.addEventListener('click', () => {
			this.plugin.setSelectedTask(task);
			this.render();
		});

		// Collapsible content
		const content = listEl.createEl('div', { cls: 'mikumodoro-project-content' });
		if (this.expandedProjects.has('__collapsed__' + taskKey)) {
			content.style.display = 'none';
			arrow.setText('▸');
		}

		// Render the task itself as the first item in the content
		this.renderTaskItem(content, task, allTasks, 0);

		// Render subtasks
		const sortedSubtasks = sortTasks(subtasks);
		for (const sub of sortedSubtasks) {
			this.renderTaskItem(content, sub, allTasks, 1);
		}

		// Toggle expand/collapse
		arrow.addEventListener('click', (e) => {
			e.stopPropagation();
			const isExpanded = !this.expandedProjects.has('__collapsed__' + taskKey);
			if (isExpanded) {
				this.expandedProjects.add('__collapsed__' + taskKey);
				arrow.setText('▸');
				content.style.display = 'none';
			} else {
				this.expandedProjects.delete('__collapsed__' + taskKey);
				arrow.setText('▾');
				content.style.display = '';
			}
		});
	}

	private openTaskCreator(projectName: string, allTasks: TodoistTask[]) {
		const modal = new Modal(this.app);
		modal.titleEl.setText('New Task in ' + projectName);

		modal.contentEl.createEl('p', {
			text: 'Create a new task in this project:',
			cls: 'mikumodoro-modal-desc',
		});

		const inputEl = modal.contentEl.createEl('input', {
			type: 'text',
			placeholder: 'Task name...',
			cls: 'mikumodoro-modal-input',
		});

		inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				const content = inputEl.value.trim();
				if (content) {
					this.createTaskInProject(projectName, allTasks, content);
					modal.close();
				}
			}
		});

		const createBtn = modal.contentEl.createEl('button', {
			cls: 'mikumodoro-btn mikumodoro-btn-primary',
			text: 'Create',
		});
		createBtn.addEventListener('click', () => {
			const content = inputEl.value.trim();
			if (content) {
				this.createTaskInProject(projectName, allTasks, content);
				modal.close();
			}
		});

		inputEl.focus();
		modal.open();
	}

	private async createTaskInProject(projectName: string, allTasks: TodoistTask[], content: string) {
		// Find the project_id from any task in that project group
		const projectTask = allTasks.find(t => t.project_name === projectName && t.project_id);
		const projectId = projectTask?.project_id || '';
		try {
			await this.plugin.todoistClient.createTask(content, undefined, projectId);
			new Notice('Task created in ' + projectName + '!');
			await this.plugin.refreshTasks();
			this.render();
		} catch (err) {
			new Notice('Failed to create task');
			console.error('Mikumodoro: Failed to create task', err);
		}
	}

	private renderTaskItem(
		listEl: HTMLElement,
		task: TodoistTask,
		allTasks: TodoistTask[],
		depth: number,
	) {
		const selected = this.plugin.getSelectedTask();
		const isSelected = selected?.id === task.id;
		const subtasks = allTasks.filter(t => t.parent_id === task.id);

		// Wrapper for this task + its subtasks
		const wrapper = listEl.createEl('div', { cls: 'mikumodoro-task-wrapper' });
		if (depth > 0) wrapper.classList.add('subtask');
		wrapper.style.marginLeft = `${depth * 16}px`;

		// Task row
		const item = wrapper.createEl('div', { cls: 'mikumodoro-task-item' });
		if (isSelected) item.classList.add('selected');

		// Expand arrow
		const arrow = item.createEl('span', { cls: 'mikumodoro-task-arrow' });
		arrow.setText('▸');

		// Task content
		item.createEl('span', {
			text: task.content,
			cls: 'mikumodoro-task-item-name',
		});

		// Priority indicator
		if (task.priority && task.priority > 1) {
			const priorityEl = item.createEl('span', { cls: 'mikumodoro-task-priority' });
			priorityEl.setText('●');
			if (task.priority === 4) priorityEl.style.color = '#ef4444';
			else if (task.priority === 3) priorityEl.style.color = '#f97316';
			else if (task.priority === 2) priorityEl.style.color = '#3b82f6';
		}

		// Due date
		if (task.due) {
			const dueEl = item.createEl('span', { cls: 'mikumodoro-task-item-due' });
			dueEl.setText(task.due.string);
		}

		// Time spent (include subtask time for top-level tasks)
		const taskMinutes = depth === 0
			? this.plugin.getTaskMinutesWithSubtasks(task.id)
			: this.plugin.getTaskMinutes(task.id);
		if (taskMinutes > 0) {
			item.createEl('span', {
				text: formatTaskTime(taskMinutes),
				cls: 'mikumodoro-task-item-time',
			});
		}

		// Click to select
		item.addEventListener('click', () => {
			this.plugin.setSelectedTask(task);
			this.autoExpandParents(task, allTasks);
			this.render();
		});

		// Note link buttons for top-level tasks
		if (depth === 0) {
			const notePath = this.plugin.getTaskNotePath(task.id);
			if (notePath) {
				const openNoteBtn = item.createEl('button', {
					cls: 'mikumodoro-header-action-btn',
					attr: { 'aria-label': 'Open linked note' },
				});
				openNoteBtn.setText('📂');
				openNoteBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					this.app.workspace.openLinkText(notePath, '', false);
				});
			} else {
				const linkBtn = item.createEl('button', {
					cls: 'mikumodoro-header-action-btn',
					attr: { 'aria-label': 'Link note' },
				});
				linkBtn.setText('🔗');
				linkBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					this.openNoteLinker(task);
				});
			}
		}

		// Subtask container (for rendering children)
		const subtaskContainer = wrapper.createEl('div', { cls: 'mikumodoro-subtask-container' });
		const expanded = this.expandedTasks.has(task.id);
		arrow.setText(expanded ? '▾' : '▸');

		// Re-render subtask container
		const updateSubtaskDisplay = () => {
			subtaskContainer.empty();
			if (!this.expandedTasks.has(task.id)) return;
			for (const sub of subtasks) {
				this.renderTaskItem(subtaskContainer, sub, allTasks, depth + 1);
			}
		};

		arrow.addEventListener('click', (e) => {
			e.stopPropagation();
			if (this.expandedTasks.has(task.id)) {
				this.expandedTasks.delete(task.id);
			} else {
				this.expandedTasks.add(task.id);
			}
			arrow.setText(this.expandedTasks.has(task.id) ? '▾' : '▸');
			updateSubtaskDisplay();
		});

		// Initial render of subtasks if expanded
		if (expanded) {
			updateSubtaskDisplay();
		}

		// Selected task detail card
		if (isSelected) {
			this.renderTaskDetail(wrapper, task);
		}
	}

	private renderTaskDetail(container: HTMLElement, task: TodoistTask) {
		const detail = container.createEl('div', { cls: 'mikumodoro-task-detail' });

		// Description
		if (task.description) {
			const descEl = detail.createEl('div', { cls: 'mikumodoro-detail-row' });
			descEl.createEl('span', { cls: 'mikumodoro-detail-label', text: 'Description' });
			descEl.createEl('span', { text: task.description, cls: 'mikumodoro-detail-value' });
		}

		// Due date
		if (task.due) {
			const dueEl = detail.createEl('div', { cls: 'mikumodoro-detail-row' });
			dueEl.createEl('span', { cls: 'mikumodoro-detail-label', text: 'Due' });
			const valEl = dueEl.createEl('span', { cls: 'mikumodoro-detail-value' });
			valEl.setText(task.due.string + (task.due.is_recurring ? ' (recurring)' : ''));
		}

		// Priority
		if (task.priority && task.priority > 1) {
			const priEl = detail.createEl('div', { cls: 'mikumodoro-detail-row' });
			priEl.createEl('span', { cls: 'mikumodoro-detail-label', text: 'Priority' });
			const levels = ['', 'Normal', 'High', 'Very High', 'Urgent'];
			priEl.createEl('span', { cls: 'mikumodoro-detail-value', text: levels[task.priority] ?? 'Normal' });
		}

		// Project
		if (task.project_name) {
			const projEl = detail.createEl('div', { cls: 'mikumodoro-detail-row' });
			projEl.createEl('span', { cls: 'mikumodoro-detail-label', text: 'Project' });
			projEl.createEl('span', { cls: 'mikumodoro-detail-value', text: task.project_name });
		}

		// Labels
		if (task.labels && task.labels.length > 0) {
			const labelsEl = detail.createEl('div', { cls: 'mikumodoro-detail-row' });
			labelsEl.createEl('span', { cls: 'mikumodoro-detail-label', text: 'Labels' });
			labelsEl.createEl('span', { cls: 'mikumodoro-detail-value', text: task.labels.join(', ') });
		}

		// Duration
		if (task.duration) {
			const durEl = detail.createEl('div', { cls: 'mikumodoro-detail-row' });
			durEl.createEl('span', { cls: 'mikumodoro-detail-label', text: 'Duration' });
			durEl.createEl('span', {
				cls: 'mikumodoro-detail-value',
				text: `${task.duration.amount} ${task.duration.unit}`,
			});
		}

		// Time spent (include subtask time for top-level tasks)
		const isTopLevel = !task.parent_id;
		const taskMinutes = isTopLevel
			? this.plugin.getTaskMinutesWithSubtasks(task.id)
			: this.plugin.getTaskMinutes(task.id);
		if (taskMinutes > 0) {
			const timeEl = detail.createEl('div', { cls: 'mikumodoro-detail-row' });
			timeEl.createEl('span', { cls: 'mikumodoro-detail-label', text: 'Time spent' });
			timeEl.createEl('span', {
				cls: 'mikumodoro-detail-value mikumodoro-detail-highlight',
				text: formatTaskTime(taskMinutes),
			});
		}

		// Action buttons
		const actionsEl = detail.createEl('div', { cls: 'mikumodoro-task-actions' });

		// Complete task button
		const completeBtn = actionsEl.createEl('button', {
			cls: 'mikumodoro-btn-mini mikumodoro-btn-complete',
			text: '✓ Complete',
		});
		completeBtn.addEventListener('click', async (e) => {
			e.stopPropagation();
			completeBtn.disabled = true;
			completeBtn.setText('Completing...');
			await this.plugin.completeSelectedTask();
			this.render();
		});

		// Note linking
		const notePath = this.plugin.getTaskNotePath(task.id);
		if (notePath) {
			const openBtn = actionsEl.createEl('button', {
				cls: 'mikumodoro-btn-mini',
				text: '📂 Open Note',
			});
			openBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.app.workspace.openLinkText(notePath, '', false);
			});

			const unlinkBtn = actionsEl.createEl('button', {
				cls: 'mikumodoro-btn-mini',
				text: '✕ Unlink',
			});
			unlinkBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.plugin.unlinkTaskNote(task.id);
				this.render();
			});
		} else {
			const linkBtn = actionsEl.createEl('button', {
				cls: 'mikumodoro-btn-mini',
				text: '🔗 Link Note',
			});
			linkBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.openNoteLinker(task);
			});
		}

		// Subtask creation
		const addSubBtn = actionsEl.createEl('button', {
			cls: 'mikumodoro-btn-mini',
			text: '＋ Subtask',
		});
		addSubBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.openSubtaskCreator(task);
		});
	}

	private openNoteLinker(task: TodoistTask) {
		const modal = new Modal(this.app);
		modal.titleEl.setText('Link Obsidian Note');

		modal.contentEl.createEl('p', {
			text: `Link a note to "${task.content}". Type a note name or search:`,
			cls: 'mikumodoro-modal-desc',
		});

		const inputEl = modal.contentEl.createEl('input', {
			type: 'text',
			placeholder: 'Note name or path...',
			cls: 'mikumodoro-modal-input',
		});

		const resultsEl = modal.contentEl.createEl('div', { cls: 'mikumodoro-modal-results' });

		let searchTimeout: ReturnType<typeof setTimeout> | null = null;
		inputEl.addEventListener('input', () => {
			if (searchTimeout) clearTimeout(searchTimeout);
			searchTimeout = setTimeout(() => {
				const query = inputEl.value.trim();
				if (!query) {
					resultsEl.empty();
					return;
				}
				const files = this.app.vault.getMarkdownFiles()
					.filter(f => f.path.toLowerCase().includes(query.toLowerCase()))
					.slice(0, 10);
				resultsEl.empty();
				for (const file of files) {
					const result = resultsEl.createEl('div', {
						cls: 'mikumodoro-modal-result-item',
						text: file.path,
					});
					result.addEventListener('click', () => {
						this.plugin.linkTaskNote(task.id, file.path);
						modal.close();
						this.render();
					});
				}
			}, 200);
		});

		const linkBtn = modal.contentEl.createEl('button', {
			cls: 'mikumodoro-btn mikumodoro-btn-primary',
			text: 'Link',
		});
		linkBtn.addEventListener('click', () => {
			const path = inputEl.value.trim();
			if (path) {
				this.plugin.linkTaskNote(task.id, path.endsWith('.md') ? path : path + '.md');
				modal.close();
				this.render();
			}
		});

		inputEl.focus();
		modal.open();
	}

	private openSubtaskCreator(parent: TodoistTask) {
		const modal = new Modal(this.app);
		modal.titleEl.setText('New Subtask');

		modal.contentEl.createEl('p', {
			text: `Create a subtask under "${parent.content}":`,
			cls: 'mikumodoro-modal-desc',
		});

		const inputEl = modal.contentEl.createEl('input', {
			type: 'text',
			placeholder: 'Subtask name...',
			cls: 'mikumodoro-modal-input',
		});

		inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				const content = inputEl.value.trim();
				if (content) {
					this.createSubtask(parent, content);
					modal.close();
				}
			}
		});

		const createBtn = modal.contentEl.createEl('button', {
			cls: 'mikumodoro-btn mikumodoro-btn-primary',
			text: 'Create',
		});
		createBtn.addEventListener('click', () => {
			const content = inputEl.value.trim();
			if (content) {
				this.createSubtask(parent, content);
				modal.close();
			}
		});

		inputEl.focus();
		modal.open();
	}

	private async createSubtask(parent: TodoistTask, content: string) {
		try {
			await this.plugin.todoistClient.createTask(content, parent.id, parent.project_id);
			new Notice('Subtask created!');
			await this.plugin.refreshTasks();
			this.render();
		} catch (err) {
			new Notice('Failed to create subtask');
			console.error('Mikumodoro: Failed to create subtask', err);
		}
	}

	private openTaskPicker() {
		const modal = new Modal(this.app);
		modal.titleEl.setText('Pick a task');

		const inputEl = modal.contentEl.createEl('input', {
			type: 'text',
			placeholder: 'Search tasks or type a custom activity...',
			cls: 'mikumodoro-modal-input',
		});

		const suggestionsEl = modal.contentEl.createEl('div', { cls: 'mikumodoro-modal-suggestions' });
		suggestionsEl.style.maxHeight = '300px';

		const todoistTasks = this.plugin.getCachedTasks();
		const customLabels = this.plugin.getCustomActivityLabels();

		const renderSuggestions = (filter: string) => {
			suggestionsEl.empty();
			const q = filter.toLowerCase();

			// Custom activities section
			const customMatched = customLabels
				.filter(l => l.toLowerCase().includes(q))
				.slice(0, 5);

			// Todoist tasks section
			const taskMatched = todoistTasks
				.filter(t => t.content.toLowerCase().includes(q))
				.slice(0, 15);

			if (customMatched.length > 0) {
				const header = suggestionsEl.createEl('div', {
					cls: 'mikumodoro-modal-suggestion-header',
					text: 'Recent Activities',
				});
				header.style.cssText = 'font-size:0.7em;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;padding:4px 12px 2px;';
				for (const label of customMatched) {
					const item = suggestionsEl.createEl('div', {
						cls: 'mikumodoro-modal-suggestion-item',
						text: '\u26a1 ' + label,
					});
					item.addEventListener('click', () => {
						this.plugin.trackCustomActivity(label);
						modal.close();
						this.render();
					});
				}
			}

			if (taskMatched.length > 0) {
				const header = suggestionsEl.createEl('div', {
					cls: 'mikumodoro-modal-suggestion-header',
					text: 'Todoist Tasks',
				});
				header.style.cssText = 'font-size:0.7em;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;padding:4px 12px 2px;';
				for (const task of taskMatched) {
					const item = suggestionsEl.createEl('div', {
						cls: 'mikumodoro-modal-suggestion-item',
						text: task.content,
					});
					if (task.project_name && task.project_name !== 'Inbox') {
						const proj = item.createEl('span', {
							cls: 'mikumodoro-modal-suggestion-project',
							text: ' ' + task.project_name,
						});
						proj.style.cssText = 'color:var(--text-muted);font-size:0.85em;';
					}
					item.addEventListener('click', () => {
						this.plugin.setSelectedTask(task);
						this.plugin.timerEngine.startWork(task);
						modal.close();
						this.render();
					});
				}
			}

			if (customMatched.length === 0 && taskMatched.length === 0 && filter.trim()) {
				suggestionsEl.createEl('div', {
					cls: 'mikumodoro-modal-suggestion-item',
					text: '\u26a1 Start custom: "' + filter.trim() + '"',
					attr: { style: 'color:var(--interactive-accent);' },
				}).addEventListener('click', () => {
					this.plugin.trackCustomActivity(filter.trim());
					modal.close();
					this.render();
				});
			}
		};

		inputEl.addEventListener('input', () => renderSuggestions(inputEl.value.trim()));
		inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				const val = inputEl.value.trim();
				if (!val) return;
				// Try exact todoist match first
				const match = todoistTasks.find(t => t.content.toLowerCase() === val.toLowerCase());
				if (match) {
					this.plugin.setSelectedTask(match);
					this.plugin.timerEngine.startWork(match);
				} else {
					this.plugin.trackCustomActivity(val);
				}
				modal.close();
				this.render();
			}
		});

		renderSuggestions('');
		inputEl.focus();
		modal.open();
	}

	private renderBottomActions(container: HTMLElement) {
		const bar = container.createEl('div', { cls: 'mikumodoro-bottom-actions' });

		const trackBtn = bar.createEl('button', {
			cls: 'mikumodoro-btn mikumodoro-btn-secondary mikumodoro-bottom-btn',
		});
		trackBtn.createEl('span', { text: '⚡ Track Activity' });
		trackBtn.addEventListener('click', () => this.openActivityTracker());

		const logBtn = bar.createEl('button', {
			cls: 'mikumodoro-btn mikumodoro-btn-secondary mikumodoro-bottom-btn',
		});
		logBtn.createEl('span', { text: '📝 Log Time' });
		logBtn.addEventListener('click', () => this.openManualTimeLogger());
	}

	private openActivityTracker() {
		const modal = new Modal(this.app);
		modal.titleEl.setText('Track Activity');

		modal.contentEl.createEl('p', {
			text: 'Start a pomodoro for something outside your Todoist tasks:',
			cls: 'mikumodoro-modal-desc',
		});

		const inputEl = modal.contentEl.createEl('input', {
			type: 'text',
			placeholder: 'Activity name...',
			cls: 'mikumodoro-modal-input',
		});

		const suggestionsEl = modal.contentEl.createEl('div', { cls: 'mikumodoro-modal-suggestions' });

		const allLabels = this.plugin.getCustomActivityLabels();
		const renderSuggestions = (filter: string) => {
			suggestionsEl.empty();
			const filtered = allLabels
				.filter(l => l.toLowerCase().includes(filter.toLowerCase()))
				.slice(0, 8);
			for (const label of filtered) {
				const item = suggestionsEl.createEl('div', {
					cls: 'mikumodoro-modal-suggestion-item',
					text: label,
				});
				item.addEventListener('click', () => {
					inputEl.value = label;
					suggestionsEl.empty();
					inputEl.focus();
				});
			}
		};

		inputEl.addEventListener('input', () => renderSuggestions(inputEl.value.trim()));
		renderSuggestions('');

		inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				const label = inputEl.value.trim();
				if (label) {
					this.plugin.trackCustomActivity(label);
					modal.close();
					this.render();
				}
			}
		});

		const startBtn = modal.contentEl.createEl('button', {
			cls: 'mikumodoro-btn mikumodoro-btn-primary',
			text: 'Start',
		});
		startBtn.addEventListener('click', () => {
			const label = inputEl.value.trim();
			if (label) {
				this.plugin.trackCustomActivity(label);
				modal.close();
				this.render();
			}
		});

		inputEl.focus();
		modal.open();
	}

	private openManualTimeLogger() {
		const modal = new Modal(this.app);
		modal.titleEl.setText('Log Time');

		modal.contentEl.createEl('p', {
			text: 'Add time for something you already did:',
			cls: 'mikumodoro-modal-desc',
		});

		const inputEl = modal.contentEl.createEl('input', {
			type: 'text',
			placeholder: 'What did you do?',
			cls: 'mikumodoro-modal-input',
		});

		const suggestionsEl = modal.contentEl.createEl('div', { cls: 'mikumodoro-modal-suggestions' });
		const allLabels = this.plugin.getCustomActivityLabels();

		const renderSuggestions = (filter: string) => {
			suggestionsEl.empty();
			const filtered = allLabels
				.filter(l => l.toLowerCase().includes(filter.toLowerCase()))
				.slice(0, 8);
			for (const label of filtered) {
				const item = suggestionsEl.createEl('div', {
					cls: 'mikumodoro-modal-suggestion-item',
					text: label,
				});
				item.addEventListener('click', () => {
					inputEl.value = label;
					suggestionsEl.empty();
				});
			}
		};

		inputEl.addEventListener('input', () => renderSuggestions(inputEl.value.trim()));
		renderSuggestions('');

		const durationArea = modal.contentEl.createEl('div', { cls: 'mikumodoro-log-duration-area' });
		durationArea.createEl('label', { text: 'Duration', cls: 'mikumodoro-log-label' });

		const sliderRow = durationArea.createEl('div', { cls: 'mikumodoro-log-slider-row' });
		const slider = sliderRow.createEl('input', {
			type: 'range',
			cls: 'mikumodoro-log-slider',
		});
		slider.min = '5';
		slider.max = '240';
		slider.step = '5';
		slider.value = '30';

		const valueDisplay = sliderRow.createEl('span', { cls: 'mikumodoro-log-value', text: '30m' });

		slider.addEventListener('input', () => {
			const val = parseInt(slider.value);
			const h = Math.floor(val / 60);
			const m = val % 60;
			valueDisplay.setText(h > 0 ? `${h}h ${m}m` : `${m}m`);
		});

		const dateArea = modal.contentEl.createEl('div', { cls: 'mikumodoro-log-date-area' });
		dateArea.createEl('label', { text: 'Date', cls: 'mikumodoro-log-label' });
		const dateInput = dateArea.createEl('input', {
			type: 'date',
			cls: 'mikumodoro-log-date-input',
		});
		const todayStr = new Date().toISOString().slice(0, 10);
		dateInput.value = todayStr;

		const addBtn = modal.contentEl.createEl('button', {
			cls: 'mikumodoro-btn mikumodoro-btn-primary',
			text: 'Add Time',
		});
		addBtn.addEventListener('click', async () => {
			const label = inputEl.value.trim();
			if (!label) return;
			const minutes = parseInt(slider.value);
			const dateStr = dateInput.value || todayStr;
			const sessionDate = new Date(dateStr + 'T12:00:00');
			await this.plugin.addManualSession(label, minutes, sessionDate);
			new Notice(`Logged ${minutes}m for "${label}"`);
			modal.close();
			this.render();
		});

		inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') addBtn.click();
		});

		inputEl.focus();
		modal.open();
	}

	private renderSessionsList(container: HTMLElement) {
		const today = new Date().toISOString().slice(0, 10);
		const todaySessions = this.plugin.timerEngine
			.getSessions()
			.filter((s) => new Date(s.startTime).toISOString().slice(0, 10) === today);

		const section = container.createEl('div', { cls: 'mikumodoro-sessions-section' });

		// Resize handle at top
		const resizeHandle = section.createEl('div', { cls: 'mikumodoro-sessions-resize-handle' });
		resizeHandle.setText('⠿');

		// Restore saved height
		const savedHeight = this.plugin.settings.sessionsHeight;
		if (savedHeight && savedHeight > 60) {
			section.style.height = savedHeight + 'px';
		}

		let isResizing = false;
		let startY = 0;
		let startHeight = 0;

		resizeHandle.addEventListener('mousedown', (e) => {
			isResizing = true;
			startY = e.clientY;
			startHeight = section.offsetHeight;
			section.classList.add('resizing');
			document.body.style.cursor = 'row-resize';
			document.body.style.userSelect = 'none';
		});

		const onMove = (e: MouseEvent) => {
			if (!isResizing) return;
			const dy = startY - e.clientY;
			const newHeight = Math.max(80, Math.min(section.parentElement!.offsetHeight - 100, startHeight + dy));
			section.style.height = newHeight + 'px';
		};

		const onUp = () => {
			if (!isResizing) return;
			isResizing = false;
			section.classList.remove('resizing');
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
			this.plugin.settings.sessionsHeight = section.offsetHeight;
			this.plugin.saveSettings();
		};

		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
		// Clean up when view closes
		this.registerEvent(this.app.workspace.on('layout-change', () => {
			if (!section.isConnected) {
				document.removeEventListener('mousemove', onMove);
				document.removeEventListener('mouseup', onUp);
			}
		}));

		section.createEl('div', { text: 'Today\'s Sessions', cls: 'mikumodoro-section-label' });

		const list = section.createEl('div', { cls: 'mikumodoro-sessions-list' });

		if (todaySessions.length === 0) {
			list.createEl('div', {
				cls: 'mikumodoro-session-total',
				text: 'No sessions yet today',
			});
			return;
		}

		const totalMin = todaySessions.reduce((a, s) => a + s.durationMinutes, 0);
		list.createEl('div', {
			cls: 'mikumodoro-session-total',
			text: `${todaySessions.length} sessions · ${(totalMin / 60).toFixed(1)}h`,
		});

		for (const s of todaySessions.reverse()) {
			const time = new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
			const item = list.createEl('div', { cls: 'mikumodoro-session-item' });
			item.createEl('span', { text: time, cls: 'mikumodoro-session-time' });
			item.createEl('span', { text: s.taskContent, cls: 'mikumodoro-session-task' });
			item.createEl('span', { text: `${s.durationMinutes}m`, cls: 'mikumodoro-session-duration' });
		}
	}
}

function sortTasks(tasks: TodoistTask[]): TodoistTask[] {
	return [...tasks].sort((a, b) => {
		const pa = a.priority ?? 1;
		const pb = b.priority ?? 1;
		if (pb !== pa) return pb - pa;
		const da = a.due?.date ?? '';
		const db = b.due?.date ?? '';
		if (da !== db) {
			if (!da) return 1;
			if (!db) return -1;
			return da.localeCompare(db);
		}
		return a.content.localeCompare(b.content);
	});
}

function formatTaskTime(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h > 0) return `${h}h ${m}m`;
	return `${m}m`;
}
