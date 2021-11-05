import debug from 'debug';
import EventEmitter, { once } from 'events';
import { API } from './api.js';
import { COLORS } from './constants.js';
import { ensure } from './ensure.js';
import { showColor, showTime } from './log.js';

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
	 * @param {{api:API}} dependencies
	 * @param {{}} config
	 */
	constructor({ api }, { }) {
		super();
		this._api = api;
		this._pbws = this._api.createWS();
		this.readyState = Board.CLOSED;
		/**
		 * @type {import('./api.js').BoardState|null}
		 */
		this._state = null;
	}
	/**
	 * @returns {import('./api.js').BoardState}
	 */
	get state() {
		if (this.readyState === Board.OPEN) {
			/** @type {import('./api.js').BoardState}*/
			return (this._state);
		}
		else {
			throw new Error(`board is ${this.readyState}`);
		}
	}
	async _build() {
		await this._pbws.initialize();
		/**@type {import('./api.js').PaintboardUpdateEvent[]} */
		let paints = [];
		/**@type {(event:import('./api.js').PaintboardUpdateEvent)=>void} */
		const onPaint = event => {
			paints.push(event);
		};
		this._pbws.on('paint', onPaint);
		const state = await Promise.race([
			this._api.getBoardState(),
			once(this._pbws, 'close').then(() => {
				throw new Error('websocket closed before boardstate is fetched');
			}),
		]);
		this._pbws.off('paint', onPaint);
		for (const { x, y, color } of paints) {
			updateLog('pre (%s,%s) %s', x.toString().padStart(3, ' '), y.toString().padStart(3, ' '), showColor(color));
			stateSet(state, x, y, color);
		}
		return state;
	}
	async _connect() {
		log('initializing');
		const state = await this._build();
		this._state = state;
		const errorEmitter = new EventEmitter();
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
				updateLog('[%s] (%s,%s) %s', showTime(time), x.toString().padStart(3, ' '), y.toString().padStart(3, ' '), showColor(color));
				this.emit('paint', event);
			}
			catch (error) {
				errorEmitter.emit('error', error);
			}
		};
		this._pbws.on('paint', onPaint);
		Promise.race([
			once(this._pbws, 'close'),
			once(errorEmitter, 'nonexist'),
		])
			.catch(error => {
				log('%O', error);
			})
			.finally(() => {
				this._state = null;
				this._pbws.off('paint', onPaint);
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
					})
					.catch(error => {
						this.readyState = Board.CLOSED;
						throw error;
					})
					.finally(() => {
						delete this._connectPromise;
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