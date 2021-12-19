import debug from 'debug';
import express from 'express';
import compression from 'compression';
import { Board } from './board.js';
import { rateLimiter } from './rateLimiter.js';
import { Drawer } from './drawer.js';

const log = debug('drawer:monitor');

/**
@typedef {{
	
}} MonitorConfig
 */

export class Monitor {
	/**
	 * @param {Drawer} drawer
	 * @param {MonitorConfig} config
	 */
	constructor({ authManager, board }, { }) {
		this.authManager = authManager;
		this.board = board;
	}
	router() {
		const router = express.Router();
		// router.get('/status', (req, res, next) => {
		// 	res.json({
		// 		board: this.board.readyState,
		// 	});
		// });
		router.get('/board', [
			...this.authManager.checkAndRequireAuth(),
			rateLimiter(30 * 1000, 5),
			/**@type {express.Handler} */(compression({ level: 1, filter: () => true })),
			/**@type {express.Handler} */
			(req, res, next) => {
				this.board.initialize()
					.then(() => {
						const { width, height, data } = this.board.state;
						res.setHeader('Content-Type', 'application/octet-stream');
						res.write(Buffer.from(Uint32Array.from([width, height]).buffer));
						res.write(data);
						res.end();
					})
					.catch(next);
			}
		]);
		return router;
	}
}