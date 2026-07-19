import {
	App,
	Notice,
	PluginSettingTab,
	Setting,
} from 'obsidian';
import type MikumodoroTimerPlugin from './main';
import { DEFAULT_SETTINGS } from './types';

export class MikumodoroSettingTab extends PluginSettingTab {
	plugin: MikumodoroTimerPlugin;

	constructor(app: App, plugin: MikumodoroTimerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Mikumodoro Timer Settings' });

		// Connection status indicator
		const statusEl = containerEl.createEl('div', { cls: 'mikumodoro-connection-status' });
		this.renderConnectionStatus(statusEl);

		const tokenSetting = new Setting(containerEl)
			.setName('Todoist API Token')
			.setDesc('Your Todoist API token. Get it from Todoist Settings > Integrations > Developer.')
			.addText((text) =>
				text
					.setPlaceholder('Enter your Todoist API token')
					.setValue(this.plugin.settings.todoistApiToken)
					.onChange(async (value) => {
						this.plugin.settings.todoistApiToken = value;
						await this.plugin.saveSettings();
						this.plugin.todoistConnected = false;
						this.plugin.clearCachedTasks();
						this.renderConnectionStatus(statusEl);
					})
			);

		tokenSetting.addButton((btn) =>
			btn
				.setButtonText('Test Connection')
				.setTooltip('Test your Todoist API token')
				.onClick(async () => {
					if (!this.plugin.settings.todoistApiToken) {
						new Notice('Enter your API token first');
						return;
					}
					btn.setButtonText('Testing...');
					btn.setDisabled(true);
					try {
						const ok = await this.plugin.testTodoistConnection();
						if (ok) {
							new Notice('Todoist connected! Tasks loaded.');
							this.renderConnectionStatus(statusEl);
						} else {
							new Notice('Failed to connect. Check your API token.');
							this.renderConnectionStatus(statusEl);
						}
					} catch {
						new Notice('Failed to connect. Check your API token.');
						this.renderConnectionStatus(statusEl);
					}
					btn.setButtonText('Test Connection');
					btn.setDisabled(false);
				})
		);

		new Setting(containerEl)
			.setName('Default work duration (minutes)')
			.setDesc('Default work session length in minutes.')
			.addText((text) =>
				text
					.setPlaceholder('25')
					.setValue(String(this.plugin.settings.defaultWorkMinutes))
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.defaultWorkMinutes = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName('Break ratio')
			.setDesc('Break duration = work duration / this ratio. Default 5 (mikumodoro style).')
			.addText((text) =>
				text
					.setPlaceholder('5')
					.setValue(String(this.plugin.settings.breakRatio))
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.breakRatio = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName('Auto-start break')
			.setDesc('Automatically start the break timer when a work session ends.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoStartBreak)
					.onChange(async (value) => {
						this.plugin.settings.autoStartBreak = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Sound chime on break')
			.setDesc('Play a chime sound when a pomodoro break starts.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.soundEnabled)
					.onChange(async (value) => {
						this.plugin.settings.soundEnabled = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('System notifications')
			.setDesc('Use system notifications for break reminders. Requires notification permission.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.notificationsEnabled)
					.onChange(async (value) => {
						this.plugin.settings.notificationsEnabled = value;
						await this.plugin.saveSettings();
						if (value && 'Notification' in window) {
							Notification.requestPermission();
						}
					})
			);

		new Setting(containerEl)
			.setName('Heatmap color')
			.setDesc('Color for the pomodoro heatmap cells (hex).')
			.addColorPicker((color) =>
				color
					.setValue(this.plugin.settings.heatmapColor)
					.onChange(async (value) => {
						this.plugin.settings.heatmapColor = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Heatmap default view')
			.setDesc('Show heatmap by year or by month.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('year', 'Year')
					.addOption('month', 'Month')
					.setValue(this.plugin.settings.heatmapViewMode ?? 'year')
					.onChange(async (value) => {
						this.plugin.settings.heatmapViewMode = value as 'year' | 'month';
						await this.plugin.saveSettings();
					})
			);

		// Reset button
		new Setting(containerEl)
			.setName('Reset settings')
			.setDesc('Reset all settings to defaults.')
			.addButton((btn) =>
				btn
					.setButtonText('Reset')
					.setWarning()
					.onClick(async () => {
						this.plugin.settings = { ...DEFAULT_SETTINGS };
						await this.plugin.saveSettings();
						this.display();
					})
			);
	}

	private renderConnectionStatus(el: HTMLElement) {
		el.empty();
		const connected = this.plugin.todoistConnected;
		const hasToken = !!this.plugin.settings.todoistApiToken;

		const dot = el.createEl('span', { cls: 'mikumodoro-status-dot' });
		const label = el.createEl('span', { cls: 'mikumodoro-status-label' });

		if (connected) {
			dot.classList.add('connected');
			label.setText('Todoist: Connected');
		} else if (hasToken) {
			dot.classList.add('untested');
			label.setText('Todoist: Token set, not tested');
		} else {
			dot.classList.add('disconnected');
			label.setText('Todoist: Not connected');
		}
	}
}
