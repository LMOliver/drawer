/**
 * @returns {import('./drawer.js').DrawConfig}
 */
export function config() {
	return {
		api: {
			paint: 'https://www.luogu.com.cn/paintboard/paint',
			board: 'https://www.luogu.com.cn/paintboard/board',
			websocket: 'wss://ws.luogu.com.cn/ws',
		},
		board: {},
		database: {
			url: 'mongodb://127.0.0.1:27017/',
			databaseName: 'paintboard',
		},
		userManager: {},
		authManager: {},
		tokenManager: {},
		monitor: {},
		server: { port: 3456 },
	};
}