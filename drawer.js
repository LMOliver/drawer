import debug from 'debug';
import { API } from './api.js';
import { AuthManager } from './authManager.js';
import { Board } from './board.js';
import { Database } from './database.js';
import { Monitor } from './monitor.js';
import { Server } from './server.js';
import { TaskManager } from './taskManager.js';
import { TokenManager } from './tokenManager.js';
import { UserManager } from './userManager.js';

/**
@typedef {{
	api: typeof API;
	board: typeof Board;
	database: typeof Database;
	monitor: typeof Monitor;
	userManager:typeof UserManager;
	authManager:typeof AuthManager;
	tokenManager:typeof TokenManager;
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
		this.api = new API(this, config.api);
		this.database = new Database(this, config.database);
		this.board = new Board(this, config.board);
		this.userManager = new UserManager(this, config.userManager);
		this.authManager = new AuthManager(this, config.authManager);
		this.tokenManager = new TokenManager(this, config.tokenManager);
		this.taskManager = new TaskManager(this, {});
		this.monitor = new Monitor(this, config.monitor);
		this.server = new Server(this, config.server);
	}
}