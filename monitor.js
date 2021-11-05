import debug from 'debug';
import express from 'express';
import compression from 'compression';
import { Board } from './board.js';

const log = debug('drawer:monitor');

/**
@typedef {{
	
}} MonitorConfig
 */

export class Monitor {
	/**
	 * @param {{board:Board}} dependencies
	 * @param {MonitorConfig} config
	 */
	constructor({ board }, { }) {
		this.board = board;
	}
	createRouter() {
		const router = express.Router();
		router.get('/status', (req, res, next) => {
			res.json({
				board: this.board.readyState,
			});
		});
		router.get('/board', [
			/**@type {express.Handler} */(compression({ level: 1, filter: () => true })),
			/**@type {express.Handler} */
			(req, res, next) => {
				// TODO: add frequency limits
				this.board.initialize()
					.then(() => {
						const { height, width, data } = this.board.state;
						res.setHeader('Content-Type', 'application/octet-stream');
						res.write(Buffer.from(Uint32Array.from([height, width]).buffer));
						res.write(data);
						res.end();
					})
					.catch(next);
			}
		]);
		return router;
	}
}