import debug from 'debug';
import EventEmitter from 'events';
import express from 'express';
import { ObjectId } from 'mongodb';
import { ensure } from './ensure/index.js';
import { ensureUID } from './authManager.js';
import { Drawer } from './drawer.js';
import { RateLimiter } from './rateLimiter.js';

const log = debug('drawer:token');

const ensureToken = ensure({
	type: 'string',
	pattern: /^[0-9a-z]{40}$/,
});
/**
 * @typedef {'working'|'waiting'|'busy'|'invalid'} TokenStatus
 */

export class TokenManager extends EventEmitter {
	/**
	 * @param {Drawer} drawer 
	 */
	constructor({ api, database, authManager, userManager }, { }) {
		super();
		this.api = api;
		this.database = database;
		this.authManager = authManager;
		this.userManager = userManager;
	}
	/**
	 * @param {ObjectId} id
	 * @param {TokenStatus} status
	 */
	async acknowledgeTokenStatus(id, status) {
		const tokens = await this.database.tokens();
		const result = await tokens.updateOne({ _id: id }, { $set: { status } });
		return { exists: result.matchedCount === 1 };
	}
	/**
	 * @param {import('./api.js').PaintToken} token
	 * @param {string|null} remark
	 * @param {string} receiver
	 * @param {TokenStatus} status
	 */
	async addToken(token, remark, receiver, status) {
		const tokens = await this.database.tokens();
		log('addToken %s remark=%s receiver=%s status=%s', token.slice(-6), String(remark), receiver, status);
		try {
			await tokens.insertOne({ token, remark, receiver, status });
			log('new token');
			this.emit('add', token, receiver);
			return { isNewToken: true };
		}
		catch (error) {
			if (error.code === /* duplicate key error */11000) {
				return { isNewToken: false };
			}
			else {
				throw error;
			}
		}
	}
	async allUsableTokens() {
		const tokens = await this.database.tokens();
		const cursor = tokens.find({ status: { $in: ['busy', 'waiting', 'working'] } });
		let items = [];
		while (true) {
			const item = await cursor.next();
			if (item) {
				items.push(item);
			}
			else {
				break;
			}
		}
		return items;
	}
	/**
	 * @param {string} uid 
	 */
	async currentTokens(uid) {
		const tokens = await this.database.tokens();
		const cursor = tokens.find({ receiver: uid });
		/**
		 @type {import('mongodb').WithId<{
			token:import('./api.js').PaintToken;
			remark:string|null;
			receiver:string;
			status:string;
		}>[]}
		 */
		let items = [];
		while (true) {
			const item = await cursor.next();
			if (item === null) {
				cursor.close();
				break;
			}
			else {
				items.push(item);
			}
		}
		return items;
	}
	/**
	 * @param {string} receiver 
	 */
	async countValidTokens(receiver) {
		const tokens = await this.database.tokens();
		return tokens.countDocuments({ receiver, status: 'working' });
	}
	/**
	 * @returns {express.Handler[]}
	 */
	uploadTokenHandler() {
		const ensureInput = ensure({
			type: 'object',
			entires: {
				token: ensureToken,
				receiver: ensureUID,
				remark: {
					type: 'union',
					branches: [
						ensureUID,
						{ type: 'constant', value: null },
					]
				}
			},
		});
		const INVALID_COST = 30 * 1000;
		const SUCCESS_COST = 5 * 1000;
		const rateLimiter = new RateLimiter(INVALID_COST * 3);
		return [
			new RateLimiter(2000).handler(1000),
			rateLimiter.handler(SUCCESS_COST),
			express.json({ limit: '5kb' }),
			async (req, res, next) => {
				try {
					const { token, receiver, remark } = ensureInput(req.body);
					const result = await this.api.validateToken(token);
					if (result.ok) {
						const { isNewToken } = await this.addToken(token, remark, receiver, 'waiting');
						if (!isNewToken) {
							rateLimiter.add(rateLimiter.key(req, res), INVALID_COST - SUCCESS_COST);
						}
						res.status(200).json({ isNewToken }).end();
					}
					else {
						rateLimiter.add(rateLimiter.key(req, res), INVALID_COST - SUCCESS_COST);
						res.status(401).send(result.reason).end();
					}
				}
				catch (error) {
					rateLimiter.add(rateLimiter.key(req, res), INVALID_COST - SUCCESS_COST);
					next(error);
				}
			},
		];
	}
	/**
	 * @returns {express.Handler[]}
	 */
	tokensForMeHandler() {
		return [
			...this.authManager.checkAndRequireAuth(),
			express.json({ limit: '5kb' }),
			(req, res, next) => {
				const { uid } = res.locals.auth;
				this.currentTokens(uid)
					.then(tokens => {
						const result = tokens.map(x => ({ remark: x.remark, status: x.status }));
						res.json(result).end();
					})
					.catch(next);
			},
		];
	}
	router() {
		return express.Router()
			.get('/tokens', this.tokensForMeHandler())
			.post('/tokens', this.uploadTokenHandler());
	}
}