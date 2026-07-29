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
