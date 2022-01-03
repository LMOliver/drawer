import debug from 'debug';
import EventEmitter, { once } from 'events';
import { COLORS } from './constants.js';
import { ensure } from './ensure/index.js';
import { formatPos, showColor, showTime } from './log.js';
import { Drawer } from './drawer.js';
import { promisify } from 'util';

const log = debug('drawer:board');
const updateLog = debug('drawer:board:update');

/**
 * @param {import('./api.js').BoardState} state 
 * @param {number} x
 * @param {number} y
 * @param {number} color
 */
function stateSet(state, x, y, color) {
	state.data[x * state.height + y] = color;
}

export class Board extends EventEmitter {
	/**@readonly */
	static CLOSED = 'closed';
	/**@readonly */
	static CONNECTING = 'connecting';
	/**@readonly */
	static OPEN = 'open';
	/**
	 * @param {Drawer} drawer
	 * @param {{}} config
	 */
	constructor({ api, database }, { }) {
		super();
		this._api = api;
		this._database = database;
		this.readyState = Board.CLOSED;
		/**
		 * @type {import('./api.js').BoardState|null}
		 */
		this._state = null;
		this._run();
	}
	_run() {
		setInterval(() => {
			this.initialize();
		}, 10 * 1000);
		let cnt = 0;
		setInterval(() => {
			if (this.readyState === Board.OPEN) {
				cnt = 0;
			}
			else if (++cnt >= 6) {
				process.exit(1); // deamon will restart the whole process
			}
		}, 10 * 1000);
	}
	/**
	 * @returns {import('./api.js').BoardState}
	 */
	get state() {
		if (this.readyState === Board.OPEN) {
			return /** @type {import('./api.js').BoardState}*/(this._state);
		}
		else {
			throw new Error(`board is ${this.readyState}`);
		}
	}
	async _build() {
		const pbws = this._api.createWS();
		await pbws.initialize();
		/**@type {import('./api.js').PaintboardUpdateEvent[]} */
		let paints = [];
		/**@type {(event:import('./api.js').PaintboardUpdateEvent)=>void} */
		const onPaint = event => {
			paints.push(event);
		};
		pbws.on('paint', onPaint);
		const state = await Promise.race([
			this._api.getBoardState(),
			once(pbws, 'close').then(() => {
				throw new Error('websocket closed before boardstate is fetched');
			}),
		]);
		pbws.off('paint', onPaint);
		for (const { x, y, color } of paints) {
			updateLog('pre (%s,%s) %s', x.toString().padStart(3, ' '), y.toString().padStart(3, ' '), showColor(color));
			stateSet(state, x, y, color);
		}
		return { pbws, state };
	}
	async _connect() {
		log('initializing');
		const { pbws, state } = await this._build();
		this._state = state;
		const errorEmitter = new EventEmitter();
		let errorEmitted = false;
		/**@type {(event:import('./api.js').PaintboardUpdateEvent)=>void} */
		const onPaint = event => {
			try {
				const { x, y, color, time } = ensure({
					type: 'object',
					entires: {
						x: { type: 'integer', min: 0, max: state.width - 1 },
						y: { type: 'integer', min: 0, max: state.height - 1 },
						color: { type: 'integer', min: 0, max: COLORS.length - 1 },
						time: { type: 'real', min: 0, max: Infinity },
					}
				})(event);
				stateSet(state, x, y, color);
				updateLog('[%s] %s %s', showTime(time), formatPos({ x, y }), showColor(color));
				this._database.paints().then(
					collection => collection.insertOne({
						time: new Date(time), x, y, color
					})
				).catch(log);
				this.emit('paint', event);
			}
			catch (error) {
				if (!errorEmitted) {
					errorEmitter.emit('error', error);
					errorEmitted = true;
				}
			}
		};
		pbws.on('paint', onPaint);
		Promise.race([
			once(pbws, 'close'),
			once(errorEmitter, 'nonexist'),
			new Promise(resolve => setTimeout(resolve, 3 * 60 * 1000)),
		])
			.catch(error => {
				log('%O', error);
			})
			.finally(() => {
				this._state = null;
				pbws.off('paint', onPaint);
				this.readyState = Board.CLOSED;
				log('closed');
				this.emit('close');
			});
		log('initialized');
	}
	initialize() {
		if (this.readyState === Board.CLOSED) {
			this.readyState = Board.CONNECTING;
			/**@type {Promise<void>} */
			this._connectPromise =
				this._connect()
					.then(() => {
						this.readyState = Board.OPEN;
						delete this._connectPromise;
					})
					.catch(async error => {
						log('%O', error);
						await promisify(setTimeout)(1000);
						this.readyState = Board.CLOSED;
						delete this._connectPromise;
						throw error;
					});
			return this._connectPromise;
		}
		else if (this.readyState === Board.CONNECTING) {
			return /**@type {Promise<void>}*/(this._connectPromise);
		}
		else {
			return Promise.resolve();
		}
	}
}