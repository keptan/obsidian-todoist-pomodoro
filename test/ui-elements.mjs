export class Element {
	constructor(options = {}, tag = 'div') {
		this.tag = tag;
		this.options = options;
		this.children = [];
		this.events = new Map();
		this.attributes = { ...options.attr };
		this.value = '';
		this.text = options.text ?? '';
		this.style = { setProperty: (key, value) => { this.attributes[key] = value; } };
		this.classes = new Set((options.cls ?? '').split(' '));
		this.classList = {
			add: (...values) => values.forEach(v => this.classes.add(v)),
			remove: value => this.classes.delete(value),
			toggle: (value, enabled) => enabled ? this.classes.add(value) : this.classes.delete(value),
		};
	}
	createEl(tag, options = {}) { const child = new Element(options, tag); this.children.push(child); return child; }
	createDiv(options = {}) { return this.createEl('div', options); }
	createSpan(options = {}) { return this.createEl('span', options); }
	setText(text) { this.text = text; }
	setAttribute(key, value) { this.attributes[key] = value; }
	empty() { this.children = []; }
	focus() { this.focused = true; }
	click() { this.emit('click'); }
	setPointerCapture(id) { this.pointerId = id; }
	releasePointerCapture() { this.pointerId = null; }
	getBoundingClientRect() { return { left: 0, width: 1000 }; }
	addEventListener(event, callback) {
		if (!this.events.has(event)) this.events.set(event, new Set());
		this.events.get(event).add(callback);
	}
	removeEventListener(event, callback) { this.events.get(event)?.delete(callback); }
	emit(event, details = {}) {
		for (const callback of [...(this.events.get(event) ?? [])]) callback({ preventDefault() {}, ...details });
	}
	all() { return [this, ...this.children.flatMap(child => child.all())]; }
	findClass(name) { return this.all().find(el => el.classes.has(name)); }
}
