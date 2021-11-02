/**
 * @returns {import('../drawer.js').DrawConfig}
 */
export function config() {
	return {
		api: {
			paint: 'http://10.196.2.7:8000/paintBoard/paint',
			board: 'http://10.196.2.7:8000/paintBoard/board',
			websocket: 'ws://10.196.2.7:8000/ws',
		},
		board: {},
		monitor: {},
		server: {
			port: 8001,
		},
	};
}