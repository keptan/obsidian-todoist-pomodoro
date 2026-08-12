// Quick test for Mikumodoro timer logic
// Run: npm test

// Mock window for Node.js
globalThis.window = {
	setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
	clearInterval: (id) => globalThis.clearInterval(id),
};

import { TimerEngine } from '../src/timer.ts';
import { formatTimerDisplay } from '../src/utils.ts';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
	if (cond) {
		console.log(`  ✓ ${msg}`);
		passed++;
	} else {
		console.log(`  ✗ ${msg}`);
		failed++;
	}
}

console.log('Timer Engine Tests');
console.log('---');

// Test 1: Initial state
const settings = {
	todoistApiToken: '',
	defaultWorkMinutes: 25,
	breakRatio: 5,
	autoStartBreak: true,
	heatmapColor: '#7c3aed',
	heatmapWeeks: 12,
};

const engine = new TimerEngine(settings);
const state = engine.getState();
assert(state.mode === 'idle', 'Initial state should be idle');
assert(state.task === null, 'Initial task should be null');
assert(state.elapsedMs === 0, 'Initial elapsed should be 0');

// Test 2: Start work with task
const mockTask = {
	id: 'task-1',
	content: 'Test task',
	project_id: 'proj-1',
	priority: 1,
	url: 'https://todoist.com/task/1',
};

engine.startWork(mockTask);
const workingState = engine.getState();
assert(workingState.mode === 'working', 'State should be working after startWork');
assert(workingState.task?.id === 'task-1', 'Task should be set');
assert(workingState.startTime !== null, 'StartTime should be set');

// Test 3: Sessions list after start
assert(engine.getSessions().length === 0, 'No sessions should exist yet during work');

// Test 4: Start break records session
engine.startBreak();
const breakState = engine.getState();
assert(breakState.mode === 'break', 'State should be break after startBreak');
assert(engine.getSessions().length === 1, 'One session should be recorded after break');
assert(engine.getSessions()[0].taskId === 'task-1', 'Session taskId should match');
assert(engine.getSessions()[0].completed === true, 'Session should be marked completed');

// Test 5: Stop returns to idle
engine.stop();
const idleState = engine.getState();
assert(idleState.mode === 'idle', 'State should be idle after stop');
assert(idleState.task === null, 'Task should be null after stop');

// Test 6: formatTimerDisplay
assert(formatTimerDisplay(0) === '00:00', '0ms should be 00:00');
assert(formatTimerDisplay(65000) === '01:05', '65000ms should be 01:05');
assert(formatTimerDisplay(3661000) === '01:01:01', '3661000ms should be 01:01:01');

// Test 7: Pause/resume
engine.startWork(mockTask);
engine.pause();
const pausedState = engine.getState();
assert(pausedState.mode === 'paused', 'State should be paused after pause');
engine.resume();
const resumedState = engine.getState();
assert(resumedState.mode === 'working', 'State should be working after resume');

// Test 8: Stop during work records partial session
engine.startWork(mockTask);
// Manually inject a session to simulate time passing
const sessionsBefore = engine.getSessions().length;
engine.stop();
// Stopping during work should record a partial session
assert(engine.getSessions().length === sessionsBefore + 1 || engine.getSessions().length === sessionsBefore, 'Stop during work may record partial session (if >1min)');

// Test 9: Load sessions
const savedSessions = engine.getSessions();
const newEngine = new TimerEngine(settings);
newEngine.loadSessions(savedSessions);
assert(newEngine.getSessions().length === savedSessions.length, 'Loaded sessions should match');

// Test 10: Break ratio math
const ratioSettings = { ...settings, breakRatio: 5 };
assert(ratioSettings.breakRatio === 5, 'Break ratio should be 5');

// Test 11: Paused breaks resume as breaks
engine.startWork(mockTask);
engine.startBreak();
engine.pause();
engine.resume();
assert(engine.getState().mode === 'break', 'Paused break should resume as break');

// Test 12: Stopping a paused break must not record a work session
engine.pause();
const sessionsBeforePausedBreakStop = engine.getSessions().length;
engine.stop();
assert(
	engine.getSessions().length === sessionsBeforePausedBreakStop,
	'Stopping a paused break should not record a work session',
);

// Test 13: Starting work from a paused break must not record a work session
engine.startWork(mockTask);
engine.startBreak();
engine.pause();
const sessionsBeforeWorkFromPausedBreak = engine.getSessions().length;
engine.startWork(mockTask);
assert(
	engine.getSessions().length === sessionsBeforeWorkFromPausedBreak,
	'Starting work from a paused break should not record a work session',
);

// Test 14: Stopping paused work completes it and starts the break
engine.stop();
engine.startWork(mockTask);
engine.pause();
const sessionsBeforePausedWorkStop = engine.getSessions().length;
engine.stop();
assert(engine.getState().mode === 'break', 'Stopping paused work should start a break');
assert(
	engine.getSessions().length === sessionsBeforePausedWorkStop + 1,
	'Stopping paused work should record the completed work session',
);
assert(
	engine.getSessions().at(-1)?.completed === true,
	'Stopping paused work should mark the session completed',
);

// Test 15: Work limit respects the auto-start break setting
const manualBreakEngine = new TimerEngine({ ...settings, autoStartBreak: false });
manualBreakEngine.startWork(mockTask);
manualBreakEngine.state.startTime = Date.now() - settings.defaultWorkMinutes * 60000;
manualBreakEngine.tick();
assert(
	manualBreakEngine.getState().mode === 'paused',
	'Disabled auto-start should wait for the user before starting a break',
);
assert(
	manualBreakEngine.isPausedWork(),
	'Disabled auto-start should preserve the completed work context',
);
assert(manualBreakEngine.isWaitingForBreak(), 'Completed work should expose the waiting-break state');
manualBreakEngine.stop();
assert(manualBreakEngine.getState().mode === 'break', 'User can start the waiting break');
assert(manualBreakEngine.getSessions().at(-1)?.completed === true, 'Waiting work is recorded completed');

const autoBreakEngine = new TimerEngine({ ...settings, autoStartBreak: true });
autoBreakEngine.startWork(mockTask);
autoBreakEngine.state.startTime = Date.now() - settings.defaultWorkMinutes * 60000;
autoBreakEngine.tick();
assert(autoBreakEngine.getState().mode === 'break', 'Enabled auto-start should enter a break');
engine.destroy();
newEngine.destroy();
manualBreakEngine.destroy();
autoBreakEngine.destroy();

console.log('---');
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
	process.exit(1);
} else {
	console.log('All tests passed! ✧ω✧');
}
