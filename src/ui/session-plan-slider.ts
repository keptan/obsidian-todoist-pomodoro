import { Component } from 'obsidian';
import { defaultSessionPlan, MAX_SESSION_MINUTES, MIN_SESSION_MINUTES, positionForTotal, splitSessionPlan, totalMinutesAt } from '../session-plan';
import type { MikumodoroSettings, SessionPlan } from '../types';

const MIN_TRACK_FRACTION = 0.15;

/** Two keyboard-accessible handles: one stretches the session, one splits work/rest. */
export class SessionPlanSlider extends Component {
	private plan: SessionPlan;

	constructor(container: HTMLElement, settings: MikumodoroSettings) {
		super();
		this.plan = defaultSessionPlan(settings);
		const row = container.createDiv({ cls: 'mikumodoro-session-plan' });
		const track = row.createDiv({ cls: 'mikumodoro-session-track' });
		track.createDiv({ cls: 'mikumodoro-session-rail' });
		const fill = track.createDiv({ cls: 'mikumodoro-session-fill' });
		fill.createDiv({ cls: 'mikumodoro-session-work' });
		fill.createDiv({ cls: 'mikumodoro-session-rest' });
		const splitHandle = this.createHandle(track, 'Work and rest split', 'split');
		const totalHandle = this.createHandle(track, 'Total session duration', 'total');
		const display = row.createDiv({ cls: 'mikumodoro-session-fraction', attr: { 'aria-live': 'polite' } });
		const workDisplay = display.createSpan({ cls: 'mikumodoro-session-work-label' });
		display.createSpan({ text: ' / ', attr: { 'aria-hidden': 'true' } });
		const restDisplay = display.createSpan({ cls: 'mikumodoro-session-rest-label' });
		container.createDiv({ cls: 'mikumodoro-session-hint', text: 'Drag the end to change total time. Drag the divider to split work and rest.' });
		const minutes = (value: number) => `${Number(value.toFixed(1))}m`;
		const total = () => this.plan.workMinutes + this.plan.restMinutes;
		let workShare = this.plan.workMinutes / total();
		const endPosition = () => MIN_TRACK_FRACTION + (1 - MIN_TRACK_FRACTION) * positionForTotal(total());
		const update = () => {
			const end = endPosition();
			const share = this.plan.workMinutes / total();
			track.style.setProperty('--session-end', `${end * 100}%`);
			track.style.setProperty('--session-split', `${end * share * 100}%`);
			track.style.setProperty('--session-work-share', `${share * 100}%`);
			workDisplay.setText(minutes(this.plan.workMinutes));
			restDisplay.setText(minutes(this.plan.restMinutes));
			display.setAttribute('aria-label', `${minutes(this.plan.workMinutes)} work / ${minutes(this.plan.restMinutes)} rest`);
			for (const [handle, value, min, max] of [
				[totalHandle, total(), MIN_SESSION_MINUTES, MAX_SESSION_MINUTES],
				[splitHandle, this.plan.workMinutes, 1, total() - 1],
			] as const) {
				handle.setAttribute('aria-valuemin', String(min));
				handle.setAttribute('aria-valuemax', String(max));
				handle.setAttribute('aria-valuenow', String(value));
				handle.setAttribute('aria-valuetext', handle === totalHandle ? `${minutes(value)} total` : `${minutes(value)} work / ${minutes(this.plan.restMinutes)} rest`);
			}
		};
		const resize = (duration: number) => {
			this.plan = splitSessionPlan(duration, workShare);
			update();
		};
		for (const [handle, kind] of [[totalHandle, 'total'], [splitHandle, 'split']] as const) {
			let pointerId: number | null = null;
			const drag = (event: PointerEvent) => {
				const bounds = track.getBoundingClientRect();
				if (bounds.width <= 0) return;
				const position = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
				if (kind === 'total') resize(totalMinutesAt((position - MIN_TRACK_FRACTION) / (1 - MIN_TRACK_FRACTION)));
				else {
					this.plan = splitSessionPlan(total(), position / endPosition());
					workShare = this.plan.workMinutes / total();
					update();
				}
			};
			this.registerDomEvent(handle, 'pointerdown', event => {
				if (event.button !== 0) return;
				event.preventDefault();
				pointerId = event.pointerId;
				handle.focus();
				handle.setPointerCapture(event.pointerId);
			});
			this.registerDomEvent(handle, 'pointermove', event => {
				if (event.pointerId === pointerId) drag(event);
			});
			this.registerDomEvent(handle, 'pointerup', event => {
				if (event.pointerId !== pointerId) return;
				drag(event);
				pointerId = null;
				handle.releasePointerCapture(event.pointerId);
			});
			this.registerDomEvent(handle, 'pointercancel', () => { pointerId = null; });
			this.registerDomEvent(handle, 'lostpointercapture', () => { pointerId = null; });
			this.registerDomEvent(handle, 'keydown', event => {
				let value = kind === 'total' ? total() : this.plan.workMinutes;
				if (event.key === 'ArrowRight' || event.key === 'ArrowUp') value += 1;
				else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') value -= 1;
				else if (event.key === 'PageUp') value += 10;
				else if (event.key === 'PageDown') value -= 10;
				else if (event.key === 'Home') value = kind === 'total' ? MIN_SESSION_MINUTES : 1;
				else if (event.key === 'End') value = kind === 'total' ? MAX_SESSION_MINUTES : total() - 1;
				else return;
				event.preventDefault();
				if (kind === 'total') resize(value);
				else {
					this.plan = splitSessionPlan(total(), value / total());
					workShare = this.plan.workMinutes / total();
					update();
				}
			});
		}
		update();
	}

	getPlan(): SessionPlan {
		return { ...this.plan };
	}

	private createHandle(track: HTMLElement, label: string, kind: string): HTMLButtonElement {
		return track.createEl('button', {
			cls: `mikumodoro-session-handle mikumodoro-session-${kind}-handle`,
			attr: { type: 'button', role: 'slider', 'aria-label': label, 'aria-orientation': 'horizontal', title: label },
		});
	}
}
