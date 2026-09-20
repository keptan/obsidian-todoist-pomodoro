/**
 * Serializes writes so an older, slower save can never overwrite newer data.
 * A failed write does not poison the queue; later saves can still proceed.
 */
export class SerializedSaveQueue {
	private queue: Promise<void> = Promise.resolve();
	private pendingCount = 0;

	get hasPending(): boolean {
		return this.pendingCount > 0;
	}

	async enqueue(save: () => Promise<void>): Promise<void> {
		this.pendingCount++;
		const queuedSave = this.queue
			.catch(() => undefined)
			.then(save)
			.finally(() => {
				this.pendingCount--;
			});
		this.queue = queuedSave;
		await queuedSave;
	}

	async drain(): Promise<void> {
		await this.queue;
	}
}

export interface DateRange {
	start: string;
	end: string;
}

export function hasRecordsMissingFromDisk<T>(
	localRecords: T[],
	diskRecords: T[],
	getId: (record: T) => string,
): boolean {
	const diskIds = new Set(diskRecords.map(getId));
	return localRecords.some(record => !diskIds.has(getId(record)));
}

export function mergeDateRanges(ranges: DateRange[]): DateRange[] {
	const sorted = ranges
		.filter(range => range.start < range.end)
		.sort((a, b) => a.start.localeCompare(b.start));
	const merged: DateRange[] = [];
	for (const range of sorted) {
		const previous = merged[merged.length - 1];
		if (!previous || range.start > previous.end) {
			merged.push({ ...range });
		} else if (range.end > previous.end) {
			previous.end = range.end;
		}
	}
	return merged;
}

export function getUncoveredDateRanges(requested: DateRange, coverage: DateRange[]): DateRange[] {
	const missing: DateRange[] = [];
	let cursor = requested.start;
	for (const range of mergeDateRanges(coverage)) {
		if (range.end <= cursor) continue;
		if (range.start >= requested.end) break;
		if (range.start > cursor) {
			missing.push({ start: cursor, end: range.start < requested.end ? range.start : requested.end });
		}
		if (range.end > cursor) cursor = range.end;
		if (cursor >= requested.end) break;
	}
	if (cursor < requested.end) missing.push({ start: cursor, end: requested.end });
	return missing;
}

/** Include a recent overlap so newly-created remote history is discovered. */
export function getDateRangesToSync(
	requested: DateRange,
	coverage: DateRange[],
	refreshFrom?: string,
): DateRange[] {
	const ranges = getUncoveredDateRanges(requested, coverage);
	if (refreshFrom && refreshFrom < requested.end) {
		ranges.push({
			start: refreshFrom > requested.start ? refreshFrom : requested.start,
			end: requested.end,
		});
	}
	return mergeDateRanges(ranges);
}
