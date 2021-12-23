import debug from 'debug';
import express from 'express';
import { UserInputError } from '../ensure';
import { AuthManager } from './authManager.js';
import { Drawer } from './drawer.js';
import { Monitor } from './monitor.js';
import { rateLimiter } from './rateLimiter.js';
import { TokenManager } from './tokenManager.js';
import { UserManager } from './userManager.js';

const log = debug('drawer:server');

/**
@typedef {{
	port:number;
}} ServerConfig
 */
export class Server {
	/**
	 * @param {Drawer} drawer
	 * @param {ServerConfig} config
	 */
	constructor({ monitor, userManager, authManager, tokenManager, taskManager }, { port }) {
		this.monitor = monitor;
		this.userManager = userManager;
		this.authManager = authManager;
		this.tokenManager = tokenManager;
		this.taskManager = taskManager;

		this.port = port;
		this.app = this.createApp();
	}
	createApp() {
		const app = express();
		app.use('/api', [
			/**@type {express.Handler} */
			(req, res, next) => {
				log('%s %s', req.method, req.originalUrl);
				next();
			},
			rateLimiter(0.3 * 1000, 50),
			rateLimiter(1 * 1000, 100),
			rateLimiter(10 * 1000, 1000),
			express.Router()
				.use('/drawer',
					express.Router()
						.use('/auth', this.authManager.router()),
					this.tokenManager.router(),
					this.taskManager.router(),
					this.monitor.router(),
				)
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
		app.listen(this.port);

		// this.tokenManager.makeTokenWSS(server, '/api/drawer/tokens');
		log('listening on port %d', this.port);
		return app;
	}
}