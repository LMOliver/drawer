import debug from 'debug';
import fetch from 'node-fetch';
import { PaintboardWS } from './api-ws.js';
import { showColor } from './log.js';
/**
 * @typedef {{uid:string,clientID:string}} Token
 * @typedef {{x:number,y:number,color:number}} Paint
 * @typedef {{data:Buffer,height:number,width:number}} BoardState
@typedef {Readonly<{
	board: string;
	paint: string;
	websocket: string;
}>} APIURLs
 * @typedef {Readonly<{x:number,y:number,color:number,time:number}>} PaintboardUpdateEvent
 */
const paintLog = debug('drawer:api:paint');
const boardLog = debug('drawer:api:board');
/**
 * @typedef {APIURLs} APIConfig
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
	 * @param {Token} param1
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
					'Cookie': `_uid=${uid}; __client_id=${clientID}`,
					'Referrer': 'https://www.luogu.com.cn/paintBoard',
				},
				body: `x=${x}&y=${y}&color=${color}`,
			});
			if (!resp.ok) {
				throw Object.assign(new Error(`${resp.status} ${resp.statusText}`), { status: resp.status, data: resp.statusText });
			}
			/**
			 * @type {{status:number,data:string}}
			 */
			const result = (await resp.json());
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
			const buffer = await resp.buffer();
			const height = buffer.indexOf('\n'.charCodeAt(0));
			if (height === -1) {
				throw new Error('incorrect board data');
			}
			const width = buffer.length / (height + 1);
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