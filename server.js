import debug from 'debug';
import express from 'express';
import { UserInputError } from './ensure.js';
import { Monitor } from './monitor.js';

const log = debug('drawer:server');

/**
@typedef {{
	port:number;
}} ServerConfig
 */
export class Server {
	/**
	 * @param {{monitor:Monitor}} dependencies
	 * @param {ServerConfig} config
	 */
	constructor({ monitor }, { port }) {
		this.port = port;
		this.monitor = monitor;
		this.app = this.createApp();
	}
	createApp() {
		const app = express();
		app.use([
			/**@type {express.Handler} */
			(req, res, next) => {
				log('%s %s', req.method, req.originalUrl);
				next();
			}
		]);
		app.use('/api', [
			this.monitor.createRouter(),
		]);
		app.use([
			/**@type {express.ErrorRequestHandler} */
			(error, req, res, next) => {
				if (error instanceof UserInputError) {
					res.status(400).send(error.message);
				}
				else {
					log('%O', error);
					res.sendStatus(500);
				}
			}
		]);
		log('listening on port %d', this.port);
		app.listen(this.port);
		return app;
	}
}