import debug from 'debug';
import express from 'express';
import compression from 'compression';
import { Board } from './board.js';
import { rateLimiter } from './rateLimiter.js';
import { Drawer } from './drawer.js';
import { ensure } from './ensure/index.js';
import { START_TIME } from './constants.js';

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
	constructor({ database, authManager, board }, { }) {
		this.database = database;
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
			// /**@type {express.Handler} */(compression({ level: 1, filter: () => true })),
			/**@type {express.Handler} */
			(req, res, next) => {
				this.board.initialize()
					.then(() => {
						const { width, height, data } = this.board.state;
						res.setHeader('Content-Type', 'application/octet-stream');
						res.write(new Uint8Array(Uint32Array.from([width, height]).buffer));
						res.write(data);
						res.end();
					})
					.catch(next);
			}
		]);
		const ensureInput = ensure({ type: 'integer', min: -1, max: Infinity });
		router.get('/paints', [
			...this.authManager.checkAndRequireAdmin(),
			/**@type {express.Handler} */
			(req, res, next) => {
				const last = ensureInput(Number(req.query.last));
				const qwq = new Date(last === -1 ? 0 : START_TIME.getTime() + last);
				this.database.paints()
					.then(p => p.find({ time: { $gt: qwq } }))
					.then(async cursor => {
						while (true) {
							const result = await cursor.next();
							if (!result) {
								break;
							}
							const { x, y, color, time } = result;
							res.write(new Uint8Array(Uint32Array.from([
								Math.max(time.getTime() - START_TIME.getTime(), 0) | 0,
								(x << 10 | y) << 8 | color
							]).buffer));
						}
						res.end();
					})
					.catch(next);
			}
		]);
		return router;
	}
}