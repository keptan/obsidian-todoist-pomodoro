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
