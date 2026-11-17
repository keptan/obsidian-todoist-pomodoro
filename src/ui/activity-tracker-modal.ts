import { Component, Modal, Notice } from 'obsidian';
import type MikumodoroTimerPlugin from '../main';
import type { TodoistTask } from '../types';
import { ActivityInput } from './activity-input';
import { SessionPlanSlider } from './session-plan-slider';

export class ActivityTrackerModal extends Modal {
	private controls = new Component();

	constructor(private plugin: MikumodoroTimerPlugin, private task?: TodoistTask) {
		super(plugin.app);
		plugin.register(() => this.close());
	}

	onOpen(): void {
		this.controls.load();
		this.titleEl.setText(this.task ? 'Start work' : 'Track activity');
		let activityInput: ActivityInput | null = null;
		if (this.task) {
			this.contentEl.createEl('p', { text: this.task.content, cls: 'mikumodoro-modal-desc' });
		} else {
			this.contentEl.createEl('p', { text: 'Select a task or enter a custom activity.', cls: 'mikumodoro-modal-desc' });
			activityInput = this.controls.addChild(new ActivityInput(this.contentEl, this.plugin.getActivitySuggestions(), () => {
				startButton.disabled = !activityInput?.getSelection();
			}));
		}
		const startButton = this.contentEl.createEl('button', {
			text: 'Start', cls: 'mikumodoro-btn mikumodoro-btn-primary',
		});
		startButton.disabled = !this.task;
		const slider = this.controls.addChild(new SessionPlanSlider(this.contentEl, this.plugin.settings));
		const start = async () => {
			const chosen = activityInput?.getSelection();
			const label = chosen?.label ?? this.task?.content ?? '';
			if (!label || startButton.disabled) return;
			const task = this.task ?? chosen?.task;
			if (task && !this.plugin.getCachedTasks().some(current => current.id === task.id && !current.checked && !current.completed_at)) {
				new Notice('This task is no longer active. Refresh tasks and select another.');
				return;
			}
			startButton.disabled = true;
			try {
				const plan = slider.getPlan();
				if (task) {
					this.plugin.setSelectedTask(task);
					this.plugin.timerEngine.startWork(task, plan);
				} else {
					await this.plugin.trackCustomActivity(label, plan);
				}
				this.close();
				this.plugin.refreshViews();
			} catch (error) {
				console.error('Mikumodoro: Failed to start activity', error);
				new Notice('Could not save the activity. Try again.');
				startButton.disabled = false;
			}
		};
		this.controls.registerDomEvent(startButton, 'click', () => { void start(); });
		if (activityInput) {
			this.controls.registerDomEvent(activityInput.input, 'keydown', event => {
				if (event.key === 'Enter' && !event.isComposing) {
					event.preventDefault();
					void start();
				}
			});
			activityInput.input.focus();
		} else startButton.focus();
	}

	onClose(): void {
		this.controls.unload();
		this.contentEl.empty();
	}
}
