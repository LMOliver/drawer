import debug from 'debug';
import { MongoClient } from 'mongodb';
import { } from 'os';

const log = debug('drawer:database');

export class Database {
	/**
	 * @param {{}} dependencies 
	 * @param {{url:string,databaseName:string}} config 
	 */
	constructor({ }, { url, databaseName }) {
		this._url = url;
		this._databaseName = databaseName;
		this._client = new MongoClient(this._url);
	}
	getDB(){
		return this._client.connect().then(connection => connection.db(this._databaseName));
	}
	async auth() {
		const db = await this.getDB();
		/**@type {import('mongodb').Collection<{token:string,uid:string,createdAt:Date}>} */
		const auth = db.collection('auth');
		await auth.createIndex('token');
		await auth.createIndex('createdAt', { expireAfterSeconds: 5 * 86400 });
		return auth;
	}
	/**
	 * @returns {Promise<import('mongodb').Collection<{_id:string,}>>}
	 */
	async users() {
		return this.getDB().then(db => db.collection('users'));
	}
	async paints() {
		return this.getDB().then(db => db.collection('paints'));
	}
}