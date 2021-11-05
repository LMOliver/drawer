const start = Date.now();
const t = process.uptime();
export function currentTime() {
	return (process.uptime() - t) * 1000 + start;
}