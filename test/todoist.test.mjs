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
