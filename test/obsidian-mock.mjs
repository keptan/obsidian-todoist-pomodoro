export class Notice {
	constructor(_message) {}
}

export async function requestUrl(request) {
	return globalThis.__obsidianRequestUrl(request);
}
