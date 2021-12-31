import debug from 'debug';
import EventEmitter, { once } from 'events';
import { WebSocket } from 'ws';
import { currentTime } from './time.js';
const wsLog = debug('drawer:api:ws');
/**
 * @param {WebSocket} ws 
 */
async function join(ws) {
	const joinMessage = JSON.stringify({ type: 'join_channel', channel: 'paintboard', channel_param: '' });
	ws.send(joinMessage);
	/**@type {[data: import('ws').RawData, isBinary: boolean]} */
	// @ts-ignore
	const joinResp = (await Promise.race([
		once(ws, 'message'),
		once(ws, 'close').then(event => {
			throw Object.assign(new Error('websocket closed before receiving response'), event);
		}),
	]));
	const [message] = joinResp;
	const { type, result } = JSON.parse(message.toString());
	if (type === 'result' && result === 'success') {
		return;
	}
	else {
		ws.close();
		throw Object.assign(new Error('incorrect response'), { resp: message.toString() });
	}
}
/**
 * @typedef {Readonly<{x:number,y:number,color:number,time:number}>} PaintboardUpdateEvent
 */
export class PaintboardWS extends EventEmitter {
	/**
	 * @readonly
	 */
	static CONNECTING = 'connecting';
	/**
	 * @readonly
	 */
	static CLOSED = 'closed';
	/**
	 * @readonly
	 */
	static OPEN = 'open';
	/**
	 * @param {string} href
	 */
	constructor(href) {
		super();
		this._websocketHref = href;
		/**@type {typeof PaintboardWS['CLOSED'|'CONNECTING'|'OPEN']} */
		this.readyState = PaintboardWS.CLOSED;
	}
	/**
	 * @param {WebSocket} ws 
	 */
	_bindWS(ws) {
		this._ws = ws;
		ws.on('message', message => {
			const now = currentTime(); // asap
			const { type, ...rest } = JSON.parse(message.toString());
			if (type === 'paintboard_update') {
				const { x, y, color } = rest;
				this.emit('paint', { x, y, color, time: now });
			}
		});
		once(ws, 'close').catch(error => {
			wsLog('%O', error);
			ws.close();
		}).finally(() => {
			delete this._ws;
			this.readyState = PaintboardWS.CLOSED;
			wsLog('disconnected');
			this.emit('close');
		});
	};
	async _connect() {
		wsLog('connecting');
		const ws = new WebSocket(this._websocketHref);
		await Promise.race([
			once(ws, 'open'),
			once(ws, 'close').then(event => {
				throw Object.assign(new Error('websocket closed before open'), event);
			})
		]);
		await join(ws);
		this._bindWS(ws);
		wsLog('connected');
		this.emit('open');
	}
	/**
	 * @returns {Promise<void>}
	 */
	initialize() {
		if (this.readyState === PaintboardWS.CLOSED) {
			this.readyState = PaintboardWS.CONNECTING;
			/**@type {Promise<void>} */
			this._connectPromise =
				this._connect()
					.then(() => {
						this.readyState = PaintboardWS.OPEN;
						delete this._connectPromise;
					})
					.catch(error => {
						this.readyState = PaintboardWS.CLOSED;
						delete this._connectPromise;
						throw error;
					})
			return this._connectPromise;
		}
		else if (this.readyState === PaintboardWS.CONNECTING) {
			return /**@type {Promise<void>}*/(this._connectPromise);
		}
		else {
			return Promise.resolve();
		}
	}
}