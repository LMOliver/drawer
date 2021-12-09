import debug from 'debug';
import { API } from './api.js';
import { Board } from './board.js';
import { Database } from './database.js';
import { Monitor } from './monitor.js';
import { Server } from './server.js';
import { UserManager } from './userManager.js';

/**
@typedef {{
	api: typeof API;
	board: typeof Board;
	database: typeof Database;
	monitor: typeof Monitor;
	userManager:typeof UserManager;
	server: typeof Server;
}} DrawComponents
@typedef {{[name in keyof DrawComponents]:ConstructorParameters<DrawComponents[name]>[1]}} DrawConfig
 */

export class Drawer {
	/**
	 * @param {DrawConfig} config 
	 */
	constructor(config) {
		debug('drawer')('config %O', config);
		this.api = new API({}, config.api);
		this.database = new Database({}, config.database);
		this.board = new Board({ api: this.api, database: this.database }, config.board);
		this.monitor = new Monitor({ board: this.board }, config.monitor);
		this.userMagager = new UserManager({ api: this.api, database: this.database }, config.userManager);
		this.server = new Server({ monitor: this.monitor, userManager: this.userMagager }, config.server);
	}
}