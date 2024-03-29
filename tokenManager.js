import debug from 'debug';
import EventEmitter from 'events';
import express from 'express';
import { ObjectId } from 'mongodb';
import { ensure, UserInputError } from './ensure/index.js';
import { ensureUID } from './authManager.js';
import { Drawer } from './drawer.js';
import { rateLimiter, RateLimiter } from './rateLimiter.js';
import { showToken } from './log.js';

const log = debug('drawer:token');

const ensureToken = ensure({
	type: 'string',
	pattern: /^[1-9]\d{0,7}:[a-zA-Z0-9]{16}$/,
});
/**
 * @typedef {'working'|'waiting'|'busy'|'invalid'} TokenStatus
 */

export class TokenManager extends EventEmitter {
	/**
	 * @param {Drawer} drawer 
	 */
	constructor(drawer, { }) {
		super();
		this.drawer = drawer;
		const { api, database, authManager, userManager } = this.drawer;
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
	 * @param {string} receiver
	 * @param {boolean} validated
	 */
	async addToken(token, receiver, validated) {
		const tokens = await this.database.tokens();
		log('addToken %s receiver=%s', showToken(token), receiver);
		const remark = token.split(':')[0] + '@Luogu';
		try {
			await tokens.insertOne({ token, remark, receiver, status: validated ? 'working' : 'waiting' });
			log('new token');
			this.emit('add', token, receiver);
			if (validated) {
				await tokens.deleteMany({ token: { $ne: token }, receiver, remark });
			}
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
	/**
	 * @param {string[]} uids 
	 * @param {string} receiver 
	 */
	async deleteTokens(uids, receiver) {
		const tokens = await this.database.tokens();
		const result = await Promise.all(
			uids.map(uid =>
				tokens.findOneAndDelete({ remark: uid, receiver })
					.then(result => {
						if (result.value) {
							return { ok: true, token: result.value.token };
						}
						else {
							throw new Error('token 不存在');
						}
					})
					.catch(error => {
						return { ok: false, reason: error.message || error.toString() };
					})
			)
		);
		return result;
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
	async allTokens() {
		const tokens = await this.database.tokens();
		const cursor = tokens.aggregate([
			{ $match: { status: { $in: ['busy', 'waiting', 'working'] } } },
			{ $project: { token: '$token' } },
		]);
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
		const cursor = tokens.find({ receiver: uid }, {
			sort: [
				['remark', 1],
			]
		});
		/**
		 @type {import('mongodb').WithId<{
			token:import('./api.js').PaintToken;
			remark:string|null;
			receiver:string;
			status:TokenStatus;
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
			},
		});
		const LOGINNED_COST = 1 * 1000;
		const ANONYMOUS_COST = 10 * 1000;
		const anonymousLimiter = new RateLimiter(ANONYMOUS_COST);
		return [
			...this.authManager.checkAuth(),
			(req, res, next) => {
				anonymousLimiter.handle(req, res, next, res.locals.auth ? LOGINNED_COST : ANONYMOUS_COST);
			},
			express.json({ limit: '5kb' }),
			async (req, res, next) => {
				try {
					const { token, receiver } = ensureInput(req.body);
					const result = await this.api.validateToken(token);
					if (result.ok) {
						const { isNewToken } = await this.addToken(token, receiver, true);
						res.status(200).json({ isNewToken }).end();
					}
					else {
						res.status(400).send(result.reason).end();
					}
				}
				catch (error) {
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
	/**
	 * @returns {express.Handler[]}
	 */
	deleteTokensHandler() {
		const ensureInput = ensure({
			type: 'array',
			maxLength: 1000,
			item: ensureUID,
		});
		return [
			...this.authManager.checkAndRequireAuth(),
			rateLimiter(10 * 1000, 2),
			express.json({ limit: '100kb' }),
			(req, res, next) => {
				const { uid } = res.locals.auth;
				const uidsToDelete = ensureInput(req.body);
				this.deleteTokens(uidsToDelete, uid)
					.then(result => {
						res.json(result).end();
					})
					.catch(next);
			}
		];
	}
	router() {
		return express.Router()
			.get('/tokens', this.tokensForMeHandler())
			.post('/tokens', this.uploadTokenHandler())
			.delete('/tokens', this.deleteTokensHandler());
	}
}