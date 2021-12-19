import debug from 'debug';
import fetch from 'node-fetch';
import { PaintboardWS } from './api-ws.js';
import { showColor } from './log.js';
/**
 * @typedef {import('../api/api.js').PaintToken} PaintToken
 * @typedef {{x:number,y:number,color:number}} Paint
 * @typedef {{data:Buffer,height:number,width:number}} BoardState
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
 * @typedef {APIURLs} APIConfig
 * @typedef {{uid:string}} SuccessfulTokenValidationResult
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
	async validateToken({ uid, clientID }) {
		try {
			validationLog('validate uid=%s', uid);
			const resp = await fetch(this.urls.paint, {
				method: "POST",
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
					'Pragma': 'no-cache',
					'Cache-Control': 'no-cache',
					'Referrer': 'https://www.luogu.com.cn/paintBoard',
				},
				body: `x=${-1}&y=${-1}&color=${-1}&uid=${uid}&token=${clientID}`,
			});
			if (!resp.ok) {
				return { ok: false, reason: `${resp.status} ${resp.statusText}` };
			}
			const result = /**@type {{status:number,data:string}}*/(await resp.json());
			const { status, data } = result;
			if (status === 401) {
				validationLog('validate uid=%s failed: %s', uid, data);
				return { ok: false, reason: data === '没有登录' ? '身份无效' : data };
			}
			else {
				validationLog('validate uid=%s successful', uid);
				return { ok: true, uid };
			}
		} catch (error) {
			validationLog('validate uid=%s %O', uid, error);
			throw error;
		}
	}
	/**
	 * @param {PaintToken} param1
	 * @param {Paint} param2 
	 * @returns {Promise<{status:number,data:string}>}
	 */
	async paint({ uid, clientID }, { x, y, color }) {
		paintLog('paint uid=%d (%d,%d) %s', uid, x, y, showColor(color));
		try {
			const resp = await fetch(this.urls.paint, {
				method: "POST",
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
					'Pragma': 'no-cache',
					'Cache-Control': 'no-cache',
					'Referrer': 'https://www.luogu.com.cn/paintBoard',
				},
				body: `x=${x}&y=${y}&color=${color}&uid=${uid}&token=${clientID}`,
			});
			if (!resp.ok) {
				throw Object.assign(new Error(`${resp.status} ${resp.statusText}`), { status: resp.status, data: resp.statusText });
			}

			const result =/** @type {{status:number,data:string}}*/(await resp.json());
			const { status, data } = result;
			if (status >= 200 && status < 300) {
				return { status, data };
			}
			else {
				throw Object.assign(new Error(data), result);
			}
		} catch (error) {
			paintLog('paint %d (%d,%d) %s failed: %o', uid, x, y, showColor(color), error);
			throw error;
		}
	};

	/**
	 * @returns {Promise<BoardState>}
	 */
	async getBoardState() {
		try {
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
		catch (error) {
			boardLog('%O', error);
			throw error;
		}
	}
	createWS() {
		return new PaintboardWS(this.urls.websocket);
	}
}