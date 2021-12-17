/**
 * @returns {import('../drawer.js').DrawConfig}
 */
export function config() {
	return {
		api: {
			// paint: 'http://10.196.2.7:8000/paintBoard/paint',
			// board: 'http://10.196.2.7:8000/paintBoard/board',
			// websocket: 'ws://10.196.2.7:8000/ws',
			paint: 'http://localhost:8000/paintBoard/paint',
			board: 'http://localhost:8000/paintBoard/board',
			websocket: 'ws://localhost:8000/ws',
		},
		board: {},
		database: {
			url: 'mongodb://127.0.0.1:27017/',
			databaseName: 'paintboard-dev',
		},
		userManager: {},
		authManager: {},
		tokenManager: {},
		monitor: {},
		server: {
			port: 3000,
		},
	};
}