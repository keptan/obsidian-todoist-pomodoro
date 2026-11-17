import { strict as assert } from 'node:assert';
import { Element } from './ui-elements.mjs';
import { ActivityInput } from '../src/ui/activity-input.ts';
import { SessionPlanSlider } from '../src/ui/session-plan-slider.ts';
import { ActivityTrackerModal } from '../src/ui/activity-tracker-modal.ts';
import { TimerView } from '../src/view.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';

const task = { id: 'task', content: 'Design', project_id: 'work', project_name: 'Work', priority: 1 };
const suggestions = [
	{ key: 'todoist:task', label: 'Design', task, lastTracked: 200 },
	{ key: 'custom:reading', label: 'Reading', lastTracked: 100 },
];
const host = new Element();
const input = new ActivityInput(host, suggestions);
input.load();
let buttons = host.all().filter(el => el.tag === 'button');
assert.equal(buttons[0].children[0].text, 'Design', 'show the most recent task before custom activities');
assert.equal(input.getSelection(), null);
input.input.value = 'des';
input.input.emit('input');
buttons = host.all().filter(el => el.tag === 'button');
assert.equal(buttons[0].children[0].text, 'Design', 'typing filters active Todoist tasks');
buttons[0].click();
assert.equal(input.getSelection().task.id, task.id, 'selecting a task retains its ID');
input.input.value = 'DESIGN';
input.input.emit('input');
assert.equal(input.getSelection().task.id, task.id, 'exact typed task names resolve without selecting a suggestion');
host.all().find(el => el.tag === 'button' && el.text.includes('custom activity')).click();
assert.equal(input.getSelection().task, undefined, 'an explicit custom choice can have the same label as a Todoist task');
input.input.value = 'reading';
input.input.emit('input');
assert.equal(input.getSelection().label, 'Reading', 'reuse saved custom spelling');
input.input.value = 'Brand new';
input.input.emit('input');
assert.equal(input.getSelection().label, 'Brand new');
input.unload();
assert.equal(input.input.events.get('input').size, 0, 'clean up picker listeners when closing');

const sliderHost = new Element();
const slider = new SessionPlanSlider(sliderHost, DEFAULT_SETTINGS);
slider.load();
const total = sliderHost.findClass('mikumodoro-session-total-handle');
const split = sliderHost.findClass('mikumodoro-session-split-handle');
assert.deepEqual(slider.getPlan(), { workMinutes: 25, restMinutes: 5 });
total.emit('keydown', { key: 'End' });
assert.deepEqual(slider.getPlan(), { workMinutes: 100, restMinutes: 20 });
split.emit('keydown', { key: 'ArrowLeft' });
assert.deepEqual(slider.getPlan(), { workMinutes: 99, restMinutes: 21 });
total.emit('keydown', { key: 'Home' });
assert.equal(slider.getPlan().workMinutes + slider.getPlan().restMinutes, 5);
total.emit('pointerdown', { button: 0, pointerId: 1 });
total.emit('pointermove', { pointerId: 1, clientX: 1000 });
total.emit('pointerup', { pointerId: 1, clientX: 1000 });
assert.deepEqual(slider.getPlan(), { workMinutes: 99, restMinutes: 21 }, 'stretching retains the chosen ratio without drift through short durations');
split.emit('pointerdown', { button: 0, pointerId: 2 });
split.emit('pointermove', { pointerId: 2, clientX: 750 });
split.emit('pointerup', { pointerId: 2, clientX: 750 });
assert.deepEqual(slider.getPlan(), { workMinutes: 90, restMinutes: 30 });
assert.match(split.attributes['aria-valuetext'], /90m work \/ 30m rest/);
assert.equal(total.attributes['aria-valuemax'], '120');
slider.unload();
assert.equal(total.events.get('pointermove').size, 0, 'clean up slider drag listeners');

globalThis.__obsidianElementFactory = () => new Element();
const starts = [];
const customStarts = [];
const logs = [];
const plugin = {
	app: {}, settings: { ...DEFAULT_SETTINGS },
	register: () => {},
	getActivitySuggestions: () => suggestions,
	getCachedTasks: () => [task],
	setSelectedTask: () => {},
	refreshViews: () => {},
	timerEngine: { startWork: (...args) => starts.push(args) },
	trackCustomActivity: async (...args) => customStarts.push(args),
	addManualLog: async (...args) => logs.push(args),
};
const modal = new ActivityTrackerModal(plugin);
modal.open();
assert.equal(starts.length, 0, 'opening the planner does not start a timer');
modal.contentEl.findClass('mikumodoro-activity-suggestion').click();
modal.contentEl.findClass('mikumodoro-session-total-handle').emit('keydown', { key: 'End' });
modal.contentEl.all().find(el => el.tag === 'button' && el.text === 'Start').click();
await Promise.resolve();
assert.equal(starts[0][0].id, task.id);
assert.deepEqual(starts[0][1], { workMinutes: 100, restMinutes: 20 }, 'the selected task starts using the actual slider values');
assert.ok(modal.closed);

const fixed = new ActivityTrackerModal(plugin, task);
fixed.open();
assert.deepEqual(fixed.contentEl.findClass('mikumodoro-session-total-handle').attributes['aria-valuenow'], '30', 'each task planner starts with configured defaults');
fixed.close();
assert.equal(starts.length, 1, 'canceling a task planner leaves the timer alone');

const custom = new ActivityTrackerModal(plugin);
custom.open();
const customInput = custom.contentEl.findClass('mikumodoro-modal-input');
customInput.value = 'New activity';
customInput.emit('input');
custom.contentEl.all().find(el => el.tag === 'button' && el.text === 'Start').click();
await Promise.resolve();
assert.deepEqual(customStarts[0], ['New activity', { workMinutes: 25, restMinutes: 5 }]);

const view = new TimerView({ app: {} }, plugin);
view.render = () => {};
view.openManualTimeLogger();
const logger = globalThis.__lastObsidianModal;
logger.contentEl.findClass('mikumodoro-activity-suggestion').click();
logger.contentEl.all().find(el => el.tag === 'button' && el.text === 'Add time').click();
await Promise.resolve();
assert.equal(logs[0][0], 'Design');
assert.equal(logs[0][6].id, task.id, 'manual logs preserve Todoist identity instead of creating a custom activity');
assert.equal(logger.closed, true);
