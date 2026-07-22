export function formatTimerDisplay(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	const parts: string[] = [];
	if (hours > 0) parts.push(String(hours).padStart(2, '0'));
	parts.push(String(minutes).padStart(2, '0'));
	parts.push(String(seconds).padStart(2, '0'));

	return parts.join(':');
}

export function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString([], {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
}

/**
 * Returns a local-date string in YYYY-MM-DD format.
 * Uses getFullYear/getMonth/getDate so it respects the user's timezone,
 * unlike toISOString().slice(0, 10) which converts to UTC first.
 */
export function formatLocalDate(date: Date | number): string {
	const d = typeof date === 'number' ? new Date(date) : date;
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}
