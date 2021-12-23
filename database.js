import debug from 'debug';
import { Binary, MongoClient } from 'mongodb';

const log = debug('drawer:database');

export class Database {
	/**
	 * @param {{}} dependencies 
	 * @param {{url:string,databaseName:string}} config 
	 */
	constructor({ }, { url, databaseName }) {
		this._url = url;
		this._databaseName = databaseName;
		this._client = new MongoClient(this._url, { keepAlive: true });
		this._connectionPromise = this._client.connect();
		this._readyPromise = this._connectionPromise;
		Promise.all([this._connectionPromise, this.init()])
			.catch(error => {
				log('error while initing: %O', error);
				throw error;
			});
	}
	async getConnection() {
		return this._readyPromise;
	}
	async getDB() {
		const connection = await this.getConnection();
		return connection.db(this._databaseName);
	}
	async init() {
		const auth = await this.auth();
		await auth.createIndex('token', { unique: true });
		await auth.createIndex('createdAt', { expireAfterSeconds: 5 * 86400 });
		log('created index for database auth');
		const tokens = await this.tokens();
		await tokens.createIndex('token', { unique: true });
		await tokens.createIndex('receiver');
		log('created index for database tokens');
		const users = await this.users();
		await users.createIndex('uid', { unique: true });
		log('created index for database users');
		const tasks = await this.tasks();
		await tasks.createIndex('owner');
		log('created index for database tasks');
		log('inited successfully');
	}
	async tokens() {
		const db = await this.getDB();
		/**@type {import('mongodb').Collection<{token:import('./api.js').PaintToken,remark:string|null,receiver:string,status:import('./tokenManager.js').TokenStatus}>} */
		const auth = db.collection('tokens');
		return auth;
	}
	async auth() {
		const db = await this.getDB();
		/**@type {import('mongodb').Collection<{token:string,uid:string,createdAt:Date}>} */
		const auth = db.collection('auth');
		return auth;
	}
	async tasks() {
		const db = await this.getDB();
		/**@type {import('mongodb').Collection<import('./taskManager.js').Task&{owner:string,verified:boolean}>} */
		const tasks = db.collection('tasks');
		return tasks;
	}
	/**
	 * @returns {Promise<import('mongodb').Collection<import('./userManager.js').User>>}
	 */
	async users() {
		return this.getDB().then(db => db.collection('users'));
	}
	async paints() {
		return this.getDB().then(db => db.collection('paints'));
	}
}