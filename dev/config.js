import { globalAgent } from 'https';
/**
 * @returns {import('../drawer.js').DrawConfig}
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
			databaseName: 'paintboard-dev',
		},
		userManager: {},
		authManager: {
			admins: new Set([
				'25512@Luogu'
			]),
			secure: false,
		},
		tokenManager: {},
		taskManager: {},
		executer: {
			agents: [
				globalAgent
			],
		},
		monitor: {},
		server: {
			port: 3456,
			trustProxy: true,
		},
	};
}