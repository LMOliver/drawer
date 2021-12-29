import debug from 'debug';
import express from 'express';
import { rateLimiter } from './rateLimiter.js';
import { Drawer } from './drawer.js';
import { ensure } from './ensure/index.js';

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
				(async () => {
					const last = ensureInput(Number(req.query.last));
					const paints = await this.database.paints();
					const firstPaint = await paints.findOne({}, { sort: [['time', 1]] });
					if (firstPaint === null) {
						res.end();
						return;
					}
					let startTime = firstPaint.time.getTime();
					const qwq = new Date(last === -1 ? 0 : startTime + last);
					// bug: it ignores paints whose time ==== qwq
					const cursor = paints.find({ time: { $gt: qwq } }, { sort: [['time', 1]] });
					while (true) {
						const result = await cursor.next();
						if (!result) {
							break;
						}
						const { x, y, color, time } = result;
						res.write(new Uint8Array(Uint32Array.from([
							Math.max(time.getTime() - startTime, 0) | 0,
							(x << 10 | y) << 8 | color
						]).buffer));
					}
					res.end();
				})().catch(next);
			}
		]);
		return router;
	}
}