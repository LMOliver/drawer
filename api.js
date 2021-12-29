import debug from 'debug';
import fetch from 'node-fetch';
import { PaintboardWS } from './api-ws.js';
import { HEIGHT, WIDTH } from './constants.js';
import { formatPos, showColor } from './log.js';
/**
 * @typedef {string} PaintToken
 * @typedef {{x:number,y:number,color:number}} Paint
 * @typedef {{data:Buffer,width:number,height:number}} BoardState
@typedef {Readonly<{
	board: string;
	paint: string;
	websocket: string;
}>} APIURLs
 * @typedef {Readonly<{x:number,y:number,color:number,time:number}>} PaintboardUpdateEvent
 */
const validationLog = debug('drawer:api:validate');
const paintLog = debug('drawer:api:paint');
const boardLog = debug('drawer:api:board');

/**
 * @param {number} status
 * @returns {PaintResultType}
 */
function typeOfCode(status) {
	if (status >= 200 && status < 300) {
		return 'success';
	}
	else if (status === 500 || status === /** Too Many Requests */429) {
		return 'cooldowning';
	}
	else if (status === 401) {
		return 'invalid-token';
	}
	else if (status >= 400 && status < 500) {
		return 'bad-request';
	}
	else if (status === /** Service Unavailable */503) {
		return 'rate-limited';
	}
	else if (status >= 500 && status < 600) {
		return 'server-error';
	}
	else {
		return 'network-error';
	}
}

/**
 * @typedef {'network-error'|'server-error'|'rate-limited'|'bad-request'|'invalid-token'|'cooldowning'|'success'} PaintResultType
 * @typedef {{type:PaintResultType,code:number,message:string}} PaintResult
 * @typedef {APIURLs} APIConfig
 * @typedef {{}} SuccessfulTokenValidationResult
 */
export class API {
	/**
	 * @param {{}} dependencies
	 * @param {APIConfig} input 
	 */
	constructor({ }, input) {
		this.urls = input;
		// log('API URLs %O', this.urls);
	}
	/**
	 * @param {PaintToken} token 
	 * @return {Promise<({ok:true}&SuccessfulTokenValidationResult)|{ok:false,reason:string}>}
	 */
	async validateToken(token) {
		validationLog('validate token');
		const result = await this._paint(token, { x: Math.floor(Math.random() * WIDTH), y: Math.floor(Math.random() * HEIGHT), color: 2 });
		if (result.type === 'success' || result.type === 'cooldowning') {
			validationLog('validation successed');
			return { ok: true };
		}
		else if (result.type === 'invalid-token') {
			const message = result.message;
			validationLog('validation failed');
			return { ok: false, reason: message === '没有登录' ? 'token 无效' : message };
		}
		else {
			validationLog('validation errored type=%s', result.type);
			throw new Error(result.message);
		}
	}
	/**
	 * @param {PaintToken} token
	 * @param {Paint} param2 
	 * @returns {Promise<PaintResult>}
	 */
	async _paint(token, { x, y, color }) {
		try {
			const resp = await fetch(this.urls.paint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
					'Pragma': 'no-cache',
					'Cache-Control': 'no-cache',
					'Referrer': 'https://www.luogu.com.cn/paintboard',
				},
				body: `x=${x}&y=${y}&color=${color}&token=${token}`,
			});
			if (resp.ok) {
				try {
					const { status, message } =/**@type {any}*/(await resp.json());
					return {
						type: typeOfCode(status),
						code: status,
						message: message || '',
					};
				}
				catch (error) {
					return { type: 'network-error', code: -1, message: error.message };
				}
			}
			else {
				return {
					type: typeOfCode(resp.status),
					code: resp.status,
					message: resp.statusText,
				};
			}
		}
		catch (error) {
			return { type: 'network-error', code: -1, message: error.message };
		}
	}
	/**
	 * @param {PaintToken} token
	 * @param {{ x: number; y: number; color: number; }} paint
	 */
	async paint(token, paint) {
		// paintLog('paint %s %s %s', formatPos(paint), showColor(paint.color), token.slice(-6));
		const result = await this._paint(token, paint);
		paintLog('%s %s %s', token.slice(-6), formatPos(paint), showColor(paint.color));
		paintLog('%s %d %s', result.type, result.code, result.message);
		return result;
	}

	/**
	 * @returns {Promise<BoardState>}
	 */
	async getBoardState() {
		boardLog('loading');
		const resp = await fetch(this.urls.board);
		if (!resp.ok) {
			throw Object.assign(new Error(`bad http status ${resp.status}`), { status: resp.status });
		}
		const arrayBuffer = await resp.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		const height = buffer.indexOf('\n'.charCodeAt(0));
		if (height === -1) {
			throw new Error('incorrect board data');
		}
		// console.log(height, buffer.length);
		const width = (buffer.length + (buffer[buffer.length - 1] === '\n'.charCodeAt(0) ? 0 : 1)) / (height + 1);
		if (!Number.isSafeInteger(width)) {
			throw new Error('incorrect board data');
		}
		// console.time('decode');
		const size = height * width;
		let data = Buffer.allocUnsafe(size);
		const lineWidth = height + 1;
		for (let x = 0; x < width; x++) {
			buffer.copy(data, x * height, x * lineWidth, x * lineWidth + height);
		}

		function createDecodeTable() {
			let qwq = new Uint8Array(256);
			for (let i = 0; i < 36; i++) {
				qwq[i.toString(36).charCodeAt(0)] = i;
			}
			return qwq;
		}
		const decodeTable = createDecodeTable();
		for (let i = 0; i < size; i++) {
			data[i] = decodeTable[data[i]];
		}

		boardLog('loaded');
		return { data, height, width };
	}
	createWS() {
		return new PaintboardWS(this.urls.websocket);
	}
}