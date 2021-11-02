import debug from 'debug';
import { API } from './api.js';
import { Board } from './board.js';
import { Monitor } from './monitor.js';
import { Server } from './server.js';

/**
@typedef {{
	api: typeof API;
	board: typeof Board;
	monitor: typeof Monitor;
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
		this.board = new Board({ api: this.api }, config.board);
		this.monitor = new Monitor({ board: this.board }, config.monitor);
		this.server = new Server({ monitor: this.monitor }, config.server);
	}
}