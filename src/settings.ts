import {
	App,
	Notice,
	PluginSettingTab,
	Setting,
} from 'obsidian';
import type MikumodoroTimerPlugin from './main';
import { DEFAULT_SETTINGS, CalendarConfig } from './types';
import { GoogleCalendarClient } from './gcal';

export class MikumodoroSettingTab extends PluginSettingTab {
	plugin: MikumodoroTimerPlugin;

	constructor(app: App, plugin: MikumodoroTimerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		;

		// Connection status indicator
		const statusEl = containerEl.createDiv({ cls: 'mikumodoro-connection-status' });
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

		// --- Google Calendar section ---
		new Setting(containerEl).setName("Google Calendar (Readonly)").setHeading();
		const gcalDesc = containerEl.createDiv({ cls: 'setting-item-description' });
		gcalDesc.setText('Add public iCal/ICS URLs from Google Calendar. Events will highlight dates on the heatmap with colored borders.');
		gcalDesc.style.marginBottom = '12px';

		this.renderCalendarList(containerEl);

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

	private renderCalendarList(containerEl: HTMLElement) {
		const listEl = containerEl.createDiv({ cls: 'mikumodoro-calendar-list' });

		const calendars = this.plugin.settings.calendars;

		for (let idx = 0; idx < calendars.length; idx++) {
			this.renderCalendarRow(listEl, idx);
		}

		// Always show an empty slot at the bottom for adding new calendars
		this.renderAddCalendarRow(listEl);
	}

	private renderCalendarRow(listEl: HTMLElement, idx: number) {
		const cal = this.plugin.settings.calendars[idx];
		if (!cal) return;

		const rowEl = listEl.createDiv({ cls: 'mikumodoro-calendar-row' });

		// URL input
		const urlInput = rowEl.createEl('input', { type: 'text', cls: 'mikumodoro-calendar-url-input' });
		urlInput.placeholder = 'https://calendar.google.com/calendar/ical/...';
		urlInput.value = cal.url;
		urlInput.addEventListener('change', async () => {
			cal.url = urlInput.value.trim();
			await this.plugin.saveSettings();
		});

		// Color picker
		const colorInput = rowEl.createEl('input', { type: 'color', cls: 'mikumodoro-calendar-color-input' });
		colorInput.value = cal.color;
		colorInput.title = 'Border color for this calendar';
		colorInput.addEventListener('change', async () => {
			cal.color = colorInput.value;
			await this.plugin.saveSettings();
			this.plugin.refreshCalendarEvents();
		});

		// Test button
		const testBtn = rowEl.createEl('button', { cls: 'mikumodoro-calendar-test-btn', text: 'Test' });
		testBtn.addEventListener('click', async () => {
			if (!cal.url) {
				new Notice('Enter a calendar URL first');
				return;
			}
			testBtn.textContent = 'Testing...';
			testBtn.disabled = true;
			const result = await GoogleCalendarClient.testCalendar(cal.url);
			if (result.ok) {
				new Notice(`Calendar OK! Found ${result.eventCount} events.`);
			} else {
				new Notice(`Calendar test failed: ${result.error ?? 'unknown error'}`);
			}
			testBtn.textContent = 'Test';
			testBtn.disabled = false;
		});

		// Remove button
		const removeBtn = rowEl.createEl('button', { cls: 'mikumodoro-calendar-remove-btn', text: '✕' });
		removeBtn.title = 'Remove this calendar';
		removeBtn.addEventListener('click', async () => {
			this.plugin.settings.calendars.splice(idx, 1);
			await this.plugin.saveSettings();
			this.plugin.refreshCalendarEvents();
			this.display();
		});
	}

	private renderAddCalendarRow(listEl: HTMLElement) {
		const rowEl = listEl.createDiv({ cls: 'mikumodoro-calendar-row mikumodoro-calendar-add-row' });

		const urlInput = rowEl.createEl('input', { type: 'text', cls: 'mikumodoro-calendar-url-input' });
		urlInput.placeholder = 'Add calendar iCal URL...';

		const colorInput = rowEl.createEl('input', { type: 'color', cls: 'mikumodoro-calendar-color-input' });
		colorInput.value = '#3b82f6';
		colorInput.title = 'Border color for this calendar';

		const addBtn = rowEl.createEl('button', { cls: 'mikumodoro-calendar-add-btn', text: '+ Add' });
		addBtn.addEventListener('click', async () => {
			const url = urlInput.value.trim();
			if (!url) {
				new Notice('Enter a calendar URL first');
				return;
			}
			const newCal: CalendarConfig = {
				url,
				color: colorInput.value,
			};
			this.plugin.settings.calendars.push(newCal);
			await this.plugin.saveSettings();
			this.plugin.refreshCalendarEvents();
			this.display();
		});

		// Also allow pressing Enter in the URL field to add
		urlInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				addBtn.click();
			}
		});
	}

	private renderConnectionStatus(el: HTMLElement) {
		el.empty();
		const connected = this.plugin.todoistConnected;
		const hasToken = !!this.plugin.settings.todoistApiToken;

		const dot = el.createSpan({ cls: 'mikumodoro-status-dot' });
		const label = el.createSpan({ cls: 'mikumodoro-status-label' });

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
