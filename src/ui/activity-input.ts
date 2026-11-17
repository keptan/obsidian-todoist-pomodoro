import { Component } from 'obsidian';
import type { ActivitySuggestion } from '../activity-suggestions';

/** Shared recent-activity picker for starting a timer and logging time. */
export class ActivityInput extends Component {
	readonly input: HTMLInputElement;
	private suggestionsEl: HTMLElement;
	private suggestionEvents = this.addChild(new Component());
	private selected: ActivitySuggestion | null = null;

	constructor(container: HTMLElement, private suggestions: ActivitySuggestion[], onChange?: () => void) {
		super();
		this.input = container.createEl('input', {
			type: 'text', placeholder: 'Search tasks and activities...', cls: 'mikumodoro-modal-input',
			attr: { 'aria-label': 'Task or activity', autocomplete: 'off' },
		});
		this.suggestionsEl = container.createDiv({ cls: 'mikumodoro-modal-suggestions mikumodoro-modal-suggestions-limited' });
		const select = (suggestion: ActivitySuggestion) => {
			this.selected = suggestion;
			this.input.value = suggestion.label;
			this.clearSuggestions();
			this.input.focus();
			onChange?.();
		};
		const render = () => {
			this.clearSuggestions();
			const query = this.input.value.trim().toLowerCase();
			const matches = this.suggestions.filter(suggestion => suggestion.label.toLowerCase().includes(query)
				|| suggestion.task?.project_name?.toLowerCase().includes(query));
			for (const suggestion of matches.slice(0, 20)) {
				const button = this.suggestionsEl.createEl('button', {
					cls: 'mikumodoro-modal-suggestion-item mikumodoro-activity-suggestion', attr: { type: 'button' },
				});
				button.createSpan({ text: suggestion.label });
				button.createSpan({
					text: suggestion.task ? `Todoist · ${suggestion.task.project_name || 'Task'}` : 'Custom activity',
					cls: 'mikumodoro-activity-source',
				});
				this.suggestionEvents.registerDomEvent(button, 'click', () => select(suggestion));
			}
			if (query && !this.suggestions.some(suggestion => !suggestion.task && suggestion.label.toLowerCase() === query)) {
				const label = this.input.value.trim();
				const custom = this.suggestionsEl.createEl('button', {
					text: `Use “${label}” as a custom activity`,
					cls: 'mikumodoro-modal-suggestion-item mikumodoro-activity-suggestion', attr: { type: 'button' },
				});
				this.suggestionEvents.registerDomEvent(custom, 'click', () => select({ key: `custom:${query}`, label, lastTracked: 0 }));
			}
		};
		this.registerDomEvent(this.input, 'input', () => {
			this.selected = null;
			render();
			onChange?.();
		});
		render();
	}

	getSelection(): ActivitySuggestion | null {
		const label = this.input.value.trim();
		if (!label) return null;
		return this.selected ?? this.suggestions.find(suggestion => suggestion.label.toLowerCase() === label.toLowerCase())
			?? { key: `custom:${label.toLowerCase()}`, label, lastTracked: 0 };
	}

	private clearSuggestions(): void {
		this.removeChild(this.suggestionEvents);
		this.suggestionEvents = this.addChild(new Component());
		this.suggestionsEl.empty();
	}
}
