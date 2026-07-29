import { requestUrl } from 'obsidian';
import type { CalendarConfig, CalendarEvent } from './types';
import { formatLocalDate } from './utils';

/**
 * Fetches and parses iCal/ICS calendars (readonly).
 * Works with Google Calendar public iCal URLs and any other ICS feed.
 */
export class GoogleCalendarClient {
	/**
	 * Fetch events from a single calendar URL, returning events mapped by date (YYYY-MM-DD).
	 */
	static async fetchEvents(cal: CalendarConfig): Promise<Map<string, CalendarEvent[]>> {
		if (!cal.url) return new Map();

		const response = await requestUrl({
			url: cal.url,
			method: 'GET',
			headers: { 'Accept': 'text/calendar, text/plain, */*' },
		});

		const icsText: string = response.text;
		return this.parseICS(icsText, cal.color);
	}

	/**
	 * Test a calendar URL by fetching it and returning the number of events found.
	 */
	static async testCalendar(url: string): Promise<{ ok: boolean; eventCount: number; error?: string }> {
		if (!url) return { ok: false, eventCount: 0, error: 'No URL provided' };
		try {
			const response = await requestUrl({
				url,
				method: 'GET',
				headers: { 'Accept': 'text/calendar, text/plain, */*' },
			});
			const events = this.parseICS(response.text, '#3b82f6');
			let total = 0;
			for (const [, evts] of events) total += evts.length;
			return { ok: true, eventCount: total };
		} catch (err: unknown) {
			return {
				ok: false,
				eventCount: 0,
				error: err instanceof Error ? err.message : 'Unknown error',
			};
		}
	}

	/**
	 * Parse ICS text into a date-to-events map.
	 * Handles VEVENT blocks with DTSTART, DTEND, SUMMARY, UID.
	 * Supports all-day events (DATE value) and timed events (DATETIME).
	 * Expands simple RRULE FREQ=DAILY/WEEKLY/MONTHLY/YEARLY with UNTIL or COUNT.
	 */
	static parseICS(icsText: string, calendarColor: string): Map<string, CalendarEvent[]> {
		const result = new Map<string, CalendarEvent[]>();
		const lines = this.unfoldICS(icsText);

		let i = 0;
		while (i < lines.length) {
			if (lines[i]!.trim().toUpperCase() === 'BEGIN:VEVENT') {
				const eventLines: string[] = [];
				i++;
				while (i < lines.length && lines[i]!.trim().toUpperCase() !== 'END:VEVENT') {
					eventLines.push(lines[i]!);
					i++;
				}
				// i is now at END:VEVENT
				const eventResult = this.parseEventBlock(eventLines, calendarColor);
				if (eventResult) {
					for (const e of eventResult) this.addEventToMap(result, e);
				}
			}
			i++;
		}

		return result;
	}

	/**
	 * Unfold ICS lines (RFC 5545 line folding: lines starting with space/tab are continuations).
	 */
	private static unfoldICS(text: string): string[] {
		const rawLines = text.split(/\r?\n/);
		const unfolded: string[] = [];
		for (const line of rawLines) {
			if (line.startsWith(' ') || line.startsWith('\t')) {
				if (unfolded.length > 0) {
					unfolded[unfolded.length - 1] += line.slice(1);
				}
			} else {
				unfolded.push(line);
			}
		}
		return unfolded;
	}

	/**
	 * Parse a single VEVENT block into a CalendarEvent (or multiple if RRULE expansion).
	 */
	private static parseEventBlock(lines: string[], calendarColor: string): CalendarEvent[] | null {
		let uid = '';
		let summary = '';
		let dtStart: { date: Date; allDay: boolean } | null = null;
		let dtEnd: { date: Date; allDay: boolean } | null = null;
		let rrule: string | null = null;

		for (const line of lines) {
			const colonIdx = line.indexOf(':');
			if (colonIdx === -1) continue;
			const keyPart = line.slice(0, colonIdx).toUpperCase();
			const value = line.slice(colonIdx + 1);

			// keyPart may include parameters like DTSTART;VALUE=DATE:20260725
			const semiIdx = keyPart.indexOf(';');
			const key = semiIdx >= 0 ? keyPart.slice(0, semiIdx) : keyPart;
			const params = semiIdx >= 0 ? keyPart.slice(semiIdx + 1) : '';

			switch (key) {
				case 'UID':
					uid = value;
					break;
				case 'SUMMARY':
					summary = this.unescapeICS(value);
					break;
				case 'DTSTART':
					dtStart = this.parseDateValue(value, params);
					break;
				case 'DTEND':
					dtEnd = this.parseDateValue(value, params);
					break;
				case 'RRULE':
					rrule = value;
					break;
			}
		}

		if (!dtStart) return null;

		// Build the base event
		const baseEvent: CalendarEvent = {
			uid: uid || `no-uid-${Date.now()}`,
			summary: summary || '(untitled)',
			start: formatLocalDate(dtStart.date),
			end: dtEnd ? formatLocalDate(dtEnd.date) : formatLocalDate(dtStart.date),
			allDay: dtStart.allDay,
			calendarColor,
		};

		if (!rrule) {
			return [baseEvent];
		}

		// Expand recurring events
		return this.expandRRule(baseEvent, dtStart, dtEnd, rrule);
	}

	/**
	 * Parse an ICS date/datetime value.
	 * Supports: 20260725 (all-day DATE), 20260725T093000Z (UTC DATETIME), 20260725T093000 (local DATETIME)
	 */
	private static parseDateValue(value: string, params: string): { date: Date; allDay: boolean } | null {
		const isDateType = params.toUpperCase().includes('VALUE=DATE') || value.length === 8;

		// Pure date: 20260725
		if (value.length === 8 && /^\d{8}$/.test(value)) {
			const y = parseInt(value.slice(0, 4));
			const m = parseInt(value.slice(4, 6)) - 1;
			const d = parseInt(value.slice(6, 8));
			return { date: new Date(y, m, d), allDay: true };
		}

		// Datetime: 20260725T093000Z or 20260725T093000
		const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
		if (match) {
			const y = match[1]!;
			const mo = match[2]!;
			const d = match[3]!;
			const h = match[4]!;
			const mi = match[5]!;
			const s = match[6]!;
			const z = match[7]!;
			const isUtc = z === 'Z';
			const date = isUtc
				? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
				: new Date(+y, +mo - 1, +d, +h, +mi, +s);
			return { date, allDay: false };
		}

		// Fallback: try Date.parse
		const fallback = new Date(value);
		if (!isNaN(fallback.getTime())) {
			return { date: fallback, allDay: isDateType };
		}

		return null;
	}

	/**
	 * Unescape ICS text values (commas, semicolons, newlines).
	 */
	private static unescapeICS(text: string): string {
		return text
			.replace(/\\n/gi, '\n')
			.replace(/\\,/g, ',')
			.replace(/\\;/g, ';')
			.replace(/\\\\/g, '\\');
	}

	/**
	 * Add an event to the date map. All-day events span from start to end (exclusive end).
	 * Timed events are placed on their start date only.
	 */
	private static addEventToMap(map: Map<string, CalendarEvent[]>, event: CalendarEvent) {
		const startDate = new Date(event.start + 'T00:00:00');
		const endDate = new Date(event.end + 'T00:00:00');

		if (event.allDay) {
			// All-day events: add to each day from start to end (exclusive)
			const cursor = new Date(startDate);
			while (cursor < endDate) {
				const dateStr = formatLocalDate(cursor);
				if (!map.has(dateStr)) map.set(dateStr, []);
				map.get(dateStr)!.push({ ...event, start: dateStr });
				cursor.setDate(cursor.getDate() + 1);
			}
		} else {
			// Timed event: add to start date only
			const dateStr = event.start;
			if (!map.has(dateStr)) map.set(dateStr, []);
			map.get(dateStr)!.push(event);
		}
	}

	/**
	 * Expand RRULE into individual event instances.
	 * Supports FREQ=DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, UNTIL, COUNT.
	 */
	private static expandRRule(
		baseEvent: CalendarEvent,
		dtStart: { date: Date; allDay: boolean },
		dtEnd: { date: Date; allDay: boolean } | null,
		rrule: string,
	): CalendarEvent[] {
		const parts = rrule.split(';').map(p => p.trim().toUpperCase());
		const rule: Record<string, string> = {};
		for (const part of parts) {
			const [k, v] = part.split('=');
			if (k && v) rule[k] = v;
		}

		const freq = rule['FREQ'];
		const interval = rule['INTERVAL'] ? parseInt(rule['INTERVAL']) : 1;
		const count = rule['COUNT'] ? parseInt(rule['COUNT']) : 50; // cap at 50 expansions
		const until = rule['UNTIL'] ? this.parseDateValue(rule['UNTIL'], rule['UNTIL']?.length === 8 ? 'VALUE=DATE' : '') : null;
		const maxIterations = Math.min(count, 200); // hard cap

		const events: CalendarEvent[] = [];
		const cursor = new Date(dtStart.date);

		for (let n = 0; n < maxIterations; n++) {
			if (until && cursor > until.date) break;

			const dateStr = formatLocalDate(cursor);
			const eventCopy: CalendarEvent = {
				...baseEvent,
				start: dateStr,
				end: dateStr,
			};
			// For all-day recurring events, expand the span
			if (dtStart.allDay && dtEnd) {
				const spanEnd = new Date(cursor);
				spanEnd.setDate(spanEnd.getDate() + Math.round((dtEnd.date.getTime() - dtStart.date.getTime()) / 86400000));
				eventCopy.end = formatLocalDate(spanEnd);
				// Add to each day in span
				const spanCursor = new Date(cursor);
				while (spanCursor < spanEnd) {
					const spanStr = formatLocalDate(spanCursor);
					events.push({ ...eventCopy, start: spanStr });
					spanCursor.setDate(spanCursor.getDate() + 1);
				}
			} else {
				events.push(eventCopy);
			}

			// Advance cursor based on FREQ
			switch (freq) {
				case 'DAILY':
					cursor.setDate(cursor.getDate() + interval);
					break;
				case 'WEEKLY':
					cursor.setDate(cursor.getDate() + 7 * interval);
					break;
				case 'MONTHLY':
					cursor.setMonth(cursor.getMonth() + interval);
					break;
				case 'YEARLY':
					cursor.setFullYear(cursor.getFullYear() + interval);
					break;
				default:
					// Unknown frequency, just return base event
					return [baseEvent];
			}
		}

		return events;
	}

	/**
	 * Merge multiple calendar event maps into a single date-to-events map.
	 */
	static mergeCalendars(maps: Map<string, CalendarEvent[]>[]): Map<string, CalendarEvent[]> {
		const merged = new Map<string, CalendarEvent[]>();
		for (const map of maps) {
			for (const [date, events] of map) {
				if (!merged.has(date)) merged.set(date, []);
				merged.get(date)!.push(...events);
			}
		}
		return merged;
	}

	/**
	 * Average the colors of multiple calendar events on the same date.
	 */
	static averageColors(events: CalendarEvent[]): string {
		if (events.length === 0) return '#3b82f6';
		if (events.length === 1) return events[0]!.calendarColor;
		let r = 0, g = 0, b = 0;
		for (const e of events) {
			const hex = e.calendarColor;
			r += parseInt(hex.slice(1, 3), 16);
			g += parseInt(hex.slice(3, 5), 16);
			b += parseInt(hex.slice(5, 7), 16);
		}
		r = Math.round(r / events.length);
		g = Math.round(g / events.length);
		b = Math.round(b / events.length);
		return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
	}
}
