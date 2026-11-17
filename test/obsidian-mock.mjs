export class Notice {
	constructor(_message) {}
}

export async function requestUrl(request) {
	return globalThis.__obsidianRequestUrl(request);
}

export function setIcon(element, icon) {
	element?.setAttribute?.('data-icon', icon);
}

export class Component {
	children = new Set();
	cleanups = [];
	loaded = false;
	load() { this.loaded = true; for (const child of this.children) child.load(); }
	unload() {
		for (const child of this.children) child.unload();
		for (const cleanup of this.cleanups.splice(0)) cleanup();
		this.loaded = false;
	}
	addChild(child) { this.children.add(child); if (this.loaded) child.load(); return child; }
	removeChild(child) { child.unload(); this.children.delete(child); return child; }
	registerDomEvent(element, event, callback) {
		element.addEventListener(event, callback);
		this.cleanups.push(() => element.removeEventListener(event, callback));
	}
}

export class Modal {
	constructor(app) {
		this.app = app;
		this.contentEl = globalThis.__obsidianElementFactory();
		this.titleEl = globalThis.__obsidianElementFactory();
		globalThis.__lastObsidianModal = this;
	}
	open() { this.onOpen?.(); }
	close() { this.closed = true; this.onClose?.(); }
}

export class ItemView extends Component {
	constructor(leaf) { super(); this.app = leaf.app; }
}
