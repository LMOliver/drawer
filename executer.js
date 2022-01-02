import { Drawer } from './drawer.js';
import { promisify } from 'util';
import { RandomSet } from './randomSet.js';
import debug from 'debug';
import { COLORS, COOLDOWN, WIDTH, HEIGHT } from './constants.js';
import { Board } from './board.js';
import EventEmitter, { once } from 'events';
import { ObjectId } from 'mongodb';
import { showToken } from './log.js';
import { currentTime } from './time.js';

const log = debug('drawer:executer');

const TRANSPARENT = 255;
function createDecodeTable() {
	const table = new Uint8Array(256);
	for (let i = 0; i < COLORS.length; i++) {
		table[i.toString(36).charCodeAt(0)] = i;
	}
	table['.'.charCodeAt(0)] = TRANSPARENT;
	return table;
}

function decodeImage({ height, width, data }) {
	const table = createDecodeTable();
	const source = new TextEncoder().encode(data).map(x => table[x]);
	const target = new Uint8Array(source.length);
	let targetIndex = 0;
	for (let x = 0; x < width; x++) {
		let sourceIndex = x;
		for (let y = 0; y < height; y++) {
			target[targetIndex++] = source[sourceIndex];
			sourceIndex += width;
		}
	}
	return {
		height,
		width,
		data: target,
	};
}

const unpackPos = (/** @type {number} */ pos) => ({ x: pos >>> 16, y: pos & ((1 << 16) - 1) });

/**
 * @param {import("./taskManager.js").Task&{owner:string,verified:boolean}} param0 
 */
const meta = ({ image, ...others }) => JSON.stringify(others);

class ExecuterTask extends EventEmitter {
	/**
	 * @param {import("./taskManager.js").Task&{owner:string,verified:boolean}} task
	 * @param {Board} board
	 */
	constructor(task, board) {
		super();
		this.meta = meta(task);

		this.x = task.options.leftTop.x;
		this.y = task.options.leftTop.y;
		this.image = decodeImage(task.image);
		this.board = board;

		this._weight = task.options.weight;
		this.owner = task.owner;
		this.verified = task.verified;

		this._positionsToCheck = new RandomSet();

		this.closed = false;
		this.working = false;
		this._run();
	}
	get weight() {
		return this._positionsToCheck.size === 0
			? 0
			: this._weight;
	}
	destroy() {
		this.closed = true;
		this.emit('_destroyed');
	}
	async _run() {
		/**
		 * @param {import('./api.js').PaintboardUpdateEvent} event
		 */
		const listener = event => {
			if (this.isInside(event)) {
				const pos = event.x << 16 | event.y;
				if (!this.isPosDone(pos)) {
					this._positionsToCheck.push(pos);
				}
			}
		};
		this.board.addListener('paint', listener);
		this.once('_destroyed', () => {
			this.board.removeListener('paint', listener);
		});
		while (!this.closed) {
			try {
				await this.board.initialize();
			}
			catch (_) {
				await promisify(setTimeout)(1000);
				continue;
			}
			let offset1 = this.x * this.board.state.height + this.y;
			let index = 0;
			for (let dx = 0; dx !== this.image.width; dx++) {
				let offset2 = offset1;
				for (let dy = 0; dy !== this.image.height; dy++) {
					// see this.isPosDone
					const target = this.image.data[index++];
					const boardState = this.board.state.data[offset2++];
					if (target !== boardState && target !== TRANSPARENT) {
						this._positionsToCheck.push((this.x + dx) << 16 | (this.y + dy));
					}
				}
				offset1 += this.board.state.height;
			}
			this.working = true;
			log('task initialized size=%d', this._positionsToCheck.size);
			await Promise.race([
				once(this.board, 'close'),
				once(this, '_destroyed')
			]);
			this.working = false;
		}
	}
	/**
	 * @param {import('./api.js').PaintboardUpdateEvent} event
	 */
	isInside(event) {
		const dx = event.x - this.x;
		if (dx < 0 || dx >= this.image.width) {
			return false;
		}
		const dy = event.y - this.y;
		if (dy < 0 || dy >= this.image.height) {
			return false;
		}
		return true;
	}
	/**
	 * this.board.readyState must be OPEN!
	 * @param {number} pos must be inside
	 */
	getTarget(pos) {
		const x = pos >> 16, y = pos & 65535; // see unpackpos
		const target = this.image.data[(x - this.x) * this.image.height + (y - this.y)];
		return target;
	}
	/**
	 * this.board.readyState must be OPEN!
	 * @param {number} pos must be inside
	 */
	isPosDone(pos) {
		const x = pos >> 16, y = pos & 65535; // see unpackpos
		const index = x * HEIGHT + y;
		const target = this.image.data[(x - this.x) * this.image.height + (y - this.y)];
		if (target === TRANSPARENT) {
			return true;
		}
		const current = this.board.state.data[index];
		return target === current;
	}
	/**
	 * @param {(pos:{x:number,y:number})=>boolean} callback 
	 * @returns {{x:number,y:number}|undefined}
	 */
	find(callback) {
		let list = [];
		const undoSideEffects = () => {
			for (const pos of list) {
				this._positionsToCheck.push(pos);
			}
		};
		while (this._positionsToCheck.size !== 0) {
			const pos = this._positionsToCheck.popRandom();
			if (!this.isPosDone(pos)) {
				const u = unpackPos(pos);
				list.push(pos);
				if (callback(u)) {
					undoSideEffects();
					return u;
				}
			}
		}
		undoSideEffects();
		return undefined;
	}
}

const wait = promisify(setTimeout);
export class Executer {
	/**
	 * @param {Drawer} drawer
	 * @param {{agents:import('https').Agent[]}} options
	 */
	constructor(drawer, options) {
		this.drawer = drawer;
		this.agents = options.agents;
		/**
		@type {Map<
			string,
			ExecuterTask
		>} */
		this.taskMap = new Map();
		/**
		@type {Map<string,Map<string,ExecuterTask>>}
		 */
		this.taskListsForUsers = new Map();

		this.tokenMap = new Map();
		this.tokenCountForUsers = new Map();

		this.isPending = new Uint8Array(WIDTH * HEIGHT).fill(0);
		/**@type {(()=>void)[]} */
		this.executionPool = [];
		this.requestBucketSize = 0;

		this.initializationPromise = this._run();
	}
	/**
	 * @param {string} id
	 * @param {import('./taskManager.js').Task&{owner:string;verified:boolean}} task
	 */
	_add(id, task) {
		log('add id=%s', id);
		const item = new ExecuterTask(task, this.drawer.board);
		this.taskMap.set(id, item);
		const qwq = this.taskListsForUsers.get(item.owner);
		if (qwq !== undefined) {
			qwq.set(id, item);
		}
		else {
			this.taskListsForUsers.set(item.owner, new Map([/**@type {[string,ExecuterTask]}*/([id, item])]));
		}
	}
	/**
	 * @param {string} id
	 */
	_delete(id) {
		log('delete id=%s', id);
		const task =/**@type {ExecuterTask}*/(this.taskMap.get(id));
		this.taskMap.delete(id);
		const qwq =/**@type {Map<string,ExecuterTask>}*/(this.taskListsForUsers.get(task.owner));
		qwq.delete(id);
		if (qwq.size === 0) {
			this.taskListsForUsers.delete(task.owner);
		}
		task.destroy();
	}
	/**
	 * @param {string} id
	 * @param {import('./taskManager.js').Task&{owner:string;verified:boolean}} task
	 */
	updateOrAdd(id, task) {
		const executer = this.taskMap.get(id);
		if (executer) {
			if (executer.meta !== meta(task)) {
				this._delete(id);
				this._add(id, task);
			}
			else {
				return;
			}
		}
		else {
			this._add(id, task);
		}
	}
	/**
	 * @param {string} id
	 */
	delete(id) {
		if (this.taskMap.has(id)) {
			this._delete(id);
		}
	}
	/**
	 * @param {Map<string,ExecuterTask>} taskMap
	 * @param {string} tokenReceiver
	 * @returns {import('./api.js').Paint | null}
	 */
	_findCommonTarget(taskMap, tokenReceiver) {
		const filter = ({ x, y }) => this.isPending[x * HEIGHT + y] === 0;
		/**
		 * @type {Map<string,number>}
		 */
		let weightSumsOfUsers = new Map();
		let candidates = [];
		for (const [id, task] of taskMap) {
			if ((task.verified || task.owner === tokenReceiver) && task.working && task.find(filter) !== undefined) {
				// console.log(id, task._positionsToCheck.size, task.weight);
				const weight = task.weight * (this.tokenCountForUsers.get(task.owner) || 0);
				if (weight > 0) {
					candidates.push({ id, task, weight });
					weightSumsOfUsers.set(task.owner, (weightSumsOfUsers.get(task.owner) || 0) + weight);
				}
			};
		}
		for (let item of candidates) {
			item.weight /= /**@type {number}*/(weightSumsOfUsers.get(item.task.owner));
		}
		const sumWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
		if (sumWeight === 0) {
			return null;
		}
		else {
			let picked = Math.random() * sumWeight;
			for (const { task, weight } of candidates) {
				picked -= weight;
				if (picked < 0) {
					const pos = task.find(filter);
					if (pos) {
						const packedPos = pos.x << 16 | pos.y;
						const result = task.getTarget(packedPos);
						if (result === TRANSPARENT) {
							log('error: result is transparent');
							return null; // make ts happy
						}
						else {
							return { x: pos.x, y: pos.y, color: result };
						}
					}
					else {
						log('error: cannot find pos');
						return null; // make ts happy
					}
				}
			}
			log('error: no task picked');
			return null; // make ts happy
		}
	}
	/**
	 * @param {string} receiver
	 */
	findTargetForUser(receiver) {
		const qwq = this.taskListsForUsers.get(receiver);
		return (qwq && this._findCommonTarget(qwq, receiver)) || this._findCommonTarget(this.taskMap, receiver);
	}
	async _run() {
		this.drawer.board.setMaxListeners(Infinity);
		const checkTask = (/** @type {ObjectId} */ id) => {
			this.drawer.database.tasks()
				.then(d => d.findOne({ _id: id }))
				.then(task => {
					// @ts-ignore task.banned
					if (task && !task.banned) {
						const { image, options, owner, verified } = task;
						this.updateOrAdd(id.toHexString(), { image, options, owner, verified });
					}
					else {
						this.delete(id.toHexString());
					}
				});
		};
		this.drawer.taskManager.on('add', checkTask);
		this.drawer.taskManager.on('update', checkTask);
		this.drawer.taskManager.on('delete', checkTask);

		const checkToken = (/** @type {import('./api.js').PaintToken} */ token) => {
			this.drawer.database.tokens()
				.then(d => d.findOne({ token }))
				.then(result => {
					if (result && result.status !== 'invalid') {
						this.addOrUpdateToken(token, result.receiver);
					}
					else {
						this.removeToken(token);
					}
				});
		};
		this.drawer.tokenManager.on('add', (token, _receiver) => {
			checkToken(token);
		});

		const qwq = async () => {
			log('update');
			const taskIDs = new Set([
				...(await this.drawer.taskManager.getAllTaskIDs()).map(x => x._id.toHexString()),
				...this.taskMap.keys()
			]);
			for (const id of taskIDs) {
				checkTask(new ObjectId(id));
			}

			const tokens = new Set([
				...(await this.drawer.tokenManager.allTokens()).map(x => x.token),
				...this.tokenMap.keys()
			]);
			for (const token of tokens) {
				checkToken(token);
			}
		};

		await qwq();
		setInterval(qwq, 30 * 1000);

		let lastUpdate = currentTime();
		const per = (100 / this.agents.length);
		setInterval(() => {
			const now = currentTime();
			const count = Math.floor((now - lastUpdate) / per);
			lastUpdate += count * per;
			for (let i = 0; i < Math.min(count, 10); i++) {
				this.putRequest();
			}
		}, 100);
	}
	putRequest() {
		const callback = this.executionPool.shift();
		if (callback) {
			callback();
		}
		else {
			if (this.requestBucketSize < 20) {
				this.requestBucketSize++;
			}
		}
	}
	/**
	 * @returns {Promise<void>}
	 */
	waitForRequest() {
		return new Promise(resolve => {
			if (this.requestBucketSize >= 0) {
				this.requestBucketSize--;
				resolve();
			}
			else {
				this.executionPool.push(resolve);
			}
		});
	}

	/**
	 * @param {{x:number,y:number}} param0 
	 * @returns {()=>void}
	 */
	reserve({ x, y }) {
		const index = x * HEIGHT + y;
		if (this.isPending[index]) {
			log('error: already reserved');
		}
		this.isPending[index] = 1;
		return () => { this.isPending[index] = 0; };
	}
	/**
	 * @param {import('./api.js').PaintToken&string} token
	 * @param {string} receiver
	 */
	addOrUpdateToken(token, receiver) {
		let executer = this.tokenMap.get(token);
		if (executer && executer.receiver !== receiver) {
			executer = undefined;
			this.removeToken(token);
		}
		if (!executer) {
			// paintLog('paint %s %s %s', formatPos(paint), showColor(paint.color), to));
			log('token %s added', showToken(token));
			const executer = new ExecuterToken(token, receiver, this);
			this.tokenMap.set(token, executer);
			this.tokenCountForUsers.set(receiver, (this.tokenCountForUsers.get(receiver) || 0) + 1);
			executer.once('destroyed', () => {
				this.removeToken(token);
			});
		}
	}
	/**
	 * @param {import('./api.js').PaintToken&string} token
	 */
	removeToken(token) {
		const executer = this.tokenMap.get(token);
		if (executer) {
			log('token %s removed', showToken(token));
			executer.kill();
			this.tokenMap.delete(token);
			const receiver = executer.receiver;
			const v = this.tokenCountForUsers.get(receiver) - 1;
			if (v > 0) {
				this.tokenCountForUsers.set(receiver, v);
			}
			else {
				this.tokenCountForUsers.delete(receiver);
			}
		}
	}
}

class ExecuterToken extends EventEmitter {
	/**
	 * @param {import('./api.js').PaintToken} token
	 * @param {string} receiver
	 * @param {Executer} executer
	 */
	constructor(token, receiver, executer) {
		super();
		this.token = token;
		this.receiver = receiver;
		this.executer = executer;
		/**@type {import('./tokenManager.js').TokenStatus|null} */
		this._status = null;
		this.busies = 0;
		this.errors = 0;
		this.lastPassedValidationTime = -Infinity;
		this.passedValidations = 0;

		this.killed = false;

		this._run();
	}
	kill() {
		this.killed = true;
	}
	/**
	 * @param {import('./tokenManager.js').TokenStatus} status
	 */
	async setStatus(status) {
		if (this._status !== status) {
			this._status = status;
			const tokens = await this.executer.drawer.database.tokens();
			/* no await */tokens.updateOne({ token: this.token }, { $set: { status } });
		}
	}
	idleWait() {
		return wait(Math.random() * COOLDOWN * 5);
	}
	get agent() {
		return this.executer.agents[parseInt(this.token.split(':')[0], 10) % this.executer.agents.length];
	}
	async _run() {
		await this.idleWait();
		while (this._status !== 'invalid' && !this.killed) {
			try {
				await this.executer.drawer.board.initialize();
			}
			catch (_) {
				await wait(1000);
				continue;
			}

			await this.executer.waitForRequest();
			const paint = this.executer.findTargetForUser(this.receiver);
			if (paint === null) {
				await this.idleWait();
				const now = currentTime();
				if (now - this.lastPassedValidationTime > COOLDOWN * Math.max(2, Math.min(2 ** this.passedValidations, 10))) {
					try {
						await this.executer.waitForRequest();
						const { ok } = await this.executer.drawer.api.validateToken(this.token);
						if (!ok) {
							this.setStatus('invalid');
						}
						else {
							this.lastPassedValidationTime = currentTime();
							if (this.passedValidations < 20) {// avoid overflow
								this.passedValidations++;
							}
							this.setStatus('working');
						}
					} catch (_) { }
				}
			}
			else {
				const release = this.executer.reserve(paint);
				const result = await this.executer.drawer.api.paint(this.agent, this.token, paint);
				setTimeout(release, 1000);// add a delay to avoid repainting
				switch (result.type) {
					case 'success': {
						this.busies = 0;
						this.errors = 0;
						this.lastPassedValidationTime = currentTime();
						this.setStatus('working');
						await wait(COOLDOWN);
						break;
					}
					case 'network-error':
					case 'server-error':
					case 'rate-limited': {
						this.errors++;
						await wait(COOLDOWN);
						break;
					}
					case 'not-started':
					case 'bad-request': {
						await wait(COOLDOWN);
						break;
					}
					case 'cooldowning': {
						this.busies++;
						this.lastPassedValidationTime = currentTime();
						if (this.busies >= 2) {
							this.setStatus('busy');
						}
						await wait(Math.min(Math.max(COOLDOWN, 1000 * 4 ** this.busies), 10 * 60 * 1000));
						break;
					}
					case 'invalid-token': {
						this.setStatus('invalid');
						break;
					}
				}
			}
		}
		if (!this.killed) {
			this.emit('destroyed');
		}
	}
};