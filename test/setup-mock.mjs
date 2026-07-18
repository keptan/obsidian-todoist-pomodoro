// Mock obsidian module for testing
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mockDir = join(__dirname, 'node_modules', 'obsidian');

mkdirSync(mockDir, { recursive: true });

// Minimal mock of obsidian exports used in the codebase
const mockModule = `
export class Notice {
	constructor(message) {
		// suppressed in tests
	}
}

export class Plugin {
	async loadData() { return {}; }
	async saveData() {}
}

export class ItemView {
	constructor() {}
}

export class WorkspaceLeaf {}

export class PluginSettingTab {}

export class Setting {
	constructor() {}
	addText() { return this; }
	addToggle() { return this; }
	addSlider() { return this; }
	addColorPicker() { return this; }
	addButton() { return this; }
	setName() { return this; }
	setDesc() { return this; }
	setButtonText() { return this; }
	setWarning() { return this; }
	onClick() {}
}

export class MarkdownView {}
export class MarkdownFileInfo {}
export class Editor {}

export function requestUrl() {
	return Promise.resolve({ json: {} });
}
`;

writeFileSync(join(mockDir, 'index.mjs'), mockModule);
writeFileSync(join(mockDir, 'package.json'), JSON.stringify({
	name: 'obsidian',
	version: '1.0.0',
	type: 'module',
	main: 'index.mjs',
}));

console.log('obsidian mock installed at:', join(mockDir));
