import { strict as assert } from 'node:assert';
import { TodoistClient } from '../src/todoist.ts';

let requested;
globalThis.__obsidianRequestUrl = async request => {
	requested = request;
	return {
		status: 204,
		text: '',
		get json() {
			throw new SyntaxError('Unexpected end of JSON input');
		},
	};
};

const client = new TodoistClient('test-token');
await client.closeTask('task-123');

assert.equal(requested.method, 'POST');
assert.equal(requested.url, 'https://api.todoist.com/api/v1/tasks/task-123/close');
assert.equal(requested.body, undefined);

const responses = [
	{
		items: [{ id: 'root-task', content: 'Completed parent', completed_at: '2026-08-12T12:00:00Z', project_id: 'project' }],
		next_cursor: 'next-page',
	},
	{
		items: [{ id: 'subtask', content: 'Completed child', completed_at: '2026-08-12T12:05:00Z', project_id: 'project' }],
		next_cursor: null,
	},
];
const historyRequests = [];
globalThis.__obsidianRequestUrl = async request => {
	historyRequests.push(request);
	return { status: 200, text: '', json: responses.shift() };
};

const completed = await client.getCompletedTasks(
	new Date('2026-08-01T00:00:00Z'),
	new Date('2026-09-01T00:00:00Z'),
);
assert.deepEqual(completed.map(task => task.task_id), ['root-task', 'subtask']);
assert.match(historyRequests[0].url, /tasks\/completed\/by_completion_date\?/);
assert.match(historyRequests[0].url, /since=2026-08-01T00%3A00%3A00.000Z/);
assert.match(historyRequests[0].url, /until=2026-09-01T00%3A00%3A00.000Z/);
assert.match(historyRequests[1].url, /cursor=next-page/);
