import debug from 'debug';
import fetch from 'node-fetch';
import { PaintboardWS } from './api-ws.js';
import { HEIGHT, WIDTH } from './constants.js';
import { formatPos, showColor, showToken } from './log.js';
import { stringify } from 'qs';
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
	else if (status === 500 || status === /** Too Many Requests */ 429) {
		return 'cooldowning';
	}
	else if (status === 401 || status === 403) {
		return 'invalid-token';
	}
	else if (status >= 400 && status < 500) {
		return 'bad-request';
	}
	else if (status === /** Service Unavailable */ 503) {
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
 * @typedef {'network-error'|'server-error'|'rate-limited'|'not-started'|'bad-request'|'invalid-token'|'cooldowning'|'success'} PaintResultType
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
		validationLog('validate token %s', showToken(token));
		const url = new URL(this.urls.paint);
		url.searchParams.set('token', token);
		const resp = await fetch(url.toString(), {
			method: 'POST',
		});
		if (resp.status === /* Forbidden */ 403 || resp.status === 418) {
			const { errorMessage = '未知错误' } = /**@type {any}*/(await resp.json());
			validationLog('validation failed %s', errorMessage);
			return {
				ok: false,
				reason: errorMessage === 'Invalid token' ? 'token 无效' : errorMessage
			};

		}
		else if (resp.status === /* Bad Request */ 400 || resp.status === 200) {
			validationLog('validation passed');
			return { ok: true };
		}
		else {
			const body = await resp.text();
			validationLog('validation errored status=%s body=%s', resp.status, body);
			throw new Error(body);
		}
	}
	/**
	 * @param {PaintToken} token
	 * @param {Paint} param2 
	 * @returns {Promise<PaintResult>}
	 */
	async _paint(token, { x, y, color }) {
		try {
			const url = new URL(this.urls.paint);
			url.searchParams.set('token', token);
			const resp = await fetch(url.toString(), {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
					'Pragma': 'no-cache',
					'Cache-Control': 'no-cache',
					'Referrer': 'https://www.luogu.com.cn/paintboard',
				},
				body: stringify({
					x, y, color,
				})
			});
			try {
				if (resp.status === 503 || resp.status === 429) {
					return {
						type: 'rate-limited',
						code: resp.status,
						message: '请求过于频繁',
					};
				}
				if (resp.status === 200) {
					return {
						type: 'success',
						code: 200,
						message: '绘制成功',
					};
				}
				const { status, errorMessage, data } =/**@type {any}*/(await resp.json());
				return {
					type: errorMessage && errorMessage.includes('未开始') ? 'not-started' : typeOfCode(status),
					code: status,
					message: errorMessage || data || '',
				};
			}
			catch (error) {
				return { type: 'network-error', code: -1, message: error.message };
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
		const result = await this._paint(token, paint);
		paintLog('%s %s %s', showToken(token), formatPos(paint), showColor(paint.color));
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