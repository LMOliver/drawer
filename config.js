/**
 * @returns {import('./drawer.js').DrawConfig}
 */
export function config() {
	return {
		api: {
			paint: 'https://www.luogu.com.cn/paintBoard/paint',
			board: 'https://www.luogu.com.cn/paintBoard/board',
			websocket: 'wss://ws.luogu.com.cn/ws',
		},
		board: {},
		monitor: {},
		server: { port: 8001 },
	};
}