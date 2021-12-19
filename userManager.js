import debug from 'debug';
import { UserInputError } from '../ensure/index.js';
import { Database } from './database.js';
import { Drawer } from './drawer.js';
import { TokenManager } from './tokenManager.js';

const log = debug('drawer:user');

/**
 * @typedef {{uid:string,taskCount:number,taskTotalSize:number}} User
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
	 * @param {import('./api.js').PaintToken} _token
	 * @param {import('./api.js').SuccessfulTokenValidationResult} result
	 */
	getUIDByPaintToken(_token, result) {
		return `${result.uid}@Luogu`;
	}
	/**
	 * @param {string} uid 
	 */
	async getLimits(uid) {
		const tokenCount = await this.drawer.tokenManager.countValidTokens(uid);
		return {
			taskCount: Math.ceil(tokenCount / 3),
			taskTotalSize: tokenCount * 1000
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
			throw new UserInputError('任务总数或总大小超出限制');
		}
	}
	/**
	 * @param {string} uid 
	 * @returns {User}
	 */
	createUser(uid) {
		return {
			uid,
			taskCount: 0,
			taskTotalSize: 0,
		};
	}
	/**
	 * @param {string} uid 
	 */
	async createUserIfNotExist(uid) {
		const users = await this.database.users();
		const user = this.createUser(uid);
		const result = await users.updateOne({ uid }, { $setOnInsert: user }, { upsert: true });
		const inserted = result.upsertedCount === 1;
		if (inserted) {
			log('new user uid=%s', uid);
		}
		return inserted;
	}
}