import debug from 'debug';
import { ensure, UserInputError } from './ensure/index.js';
import { Drawer } from './drawer.js';
import express from 'express';
import { ensureUID } from './authManager.js';

const log = debug('drawer:user');

/**
 * @typedef {{uid:string,name:string,taskCount:number,taskTotalSize:number}} User
 */

/**
@typedef {{
	
}} UserManagerConfig
*/
export class UserManager {
	/**
	 * @param {Drawer} drawer 
	 * @param {UserManagerConfig} config
	 */
	constructor(drawer, { }) {
		this.drawer = drawer;
		this.database = this.drawer.database;
	}
	/**
	 * @param {string} uid 
	 */
	async getLimits(uid) {
		const tokenCount = await this.drawer.tokenManager.countValidTokens(uid);
		return {
			taskCount: Math.max(1, Math.floor(tokenCount / 5)),
			taskTotalSize: Math.max(50 ** 2, tokenCount * 1000),
		};
	}
	/**
	 * @param {string} uid
	 */
	async consumeResources(uid, { deltaCount, deltaTotalSize }) {
		const { taskCount, taskTotalSize } = await this.getLimits(uid);
		log('limits uid=%s taskCount=%d taskTotalSize=%d', uid, taskCount, taskTotalSize);
		// log('delta deltaCount=%d deltaTotalSize=%d', deltaCount, deltaTotalSize);
		const users = await this.database.users();
		const result = await users.updateOne({
			uid,
			...(deltaCount >= 0 ? { taskCount: { $lte: taskCount - deltaCount } } : {}),
			...(deltaTotalSize >= 0 ? { taskTotalSize: { $lte: taskTotalSize - deltaTotalSize } } : {}),
		}, {
			$inc: { taskCount: deltaCount, taskTotalSize: deltaTotalSize },
		});
		if (result.matchedCount === 1) {
			return async () => {
				await users.updateOne({ uid }, {
					$inc: { taskCount: -deltaCount, taskTotalSize: -deltaTotalSize },
				});
			};
		}
		else {
			throw new UserInputError('任务总数或总大小超出限制，请先提交更多 token');
		}
	}
	/**
	 * @param {{uid:string,name:string}} a
	 * @returns {User}
	 */
	createUser({ uid, name }) {
		return {
			uid,
			name,
			taskCount: 0,
			taskTotalSize: 0,
		};
	}
	/**
	 * @param {{uid:string,name:string}} a
	 */
	async createUserIfNotExist({ uid, name }) {
		const users = await this.database.users();
		const user = this.createUser({ uid, name });
		const result = await users.updateOne({ uid }, { $setOnInsert: user }, { upsert: true });
		const inserted = result.upsertedCount === 1;
		if (inserted) {
			log('new user uid=%s', uid);
		}
		return inserted;
	}
	/**
	 * @param {string} uid
	 */
	async getUser(uid) {
		const users = await this.database.users();
		return users.findOne({ uid });
	}
	router() {
		const ensureInput = ensure({ type: 'object', entires: { uid: ensureUID } });
		return express.Router()
			.get('/user/:uid([1-9]\\d{0,7}@Luogu)',
				(req, res, next) => {
					const { uid } = ensureInput(req.params);
					this.getUser(uid)
						.then(user => {
							if (!user) {
								res.status(404).send('用户不存在').end();
							}
							else {
								res.status(200).json({ uid: user.uid, name: user.name }).end();
							}
						})
						.catch(next);
				}
			);
	}
}