import debug from 'debug';
import { Database } from './database.js';

const log = debug('drawer:user');

/**
@typedef {{
	
}} UserManagerConfig
*/
export class UserManager {
	/**
	 * @param {{database:Database}} dependencies 
	 * @param {UserManagerConfig} config
	 */
	constructor({ database }, { }) {
		this.database = database;
	}
	/**
	 * @param {import('./api.js').PaintToken} _token
	 * @param {import('./api.js').SuccessfulTokenValidationResult} result
	 */
	generateUIDByPaintToken(_token, result) {
		return `${result.uid}@Luogu`;
	}
	/**
	 * @param {string} uid 
	 */
	createUser(uid) {
		return {
			uid,
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