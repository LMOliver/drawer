import debug from 'debug';
import EventEmitter from 'events';
import express from 'express';
import { ensure } from '../ensure/index.js';
import { ensureToken, ensureUID } from './authManager.js';
import { Drawer } from './drawer.js';
import { RateLimiter, rateLimiter } from './rateLimiter.js';

const log = debug('drawer:token');

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
	 * @param {string} type 
	 * @param {string} uid 
	 */
	eventKey(type, uid) {
		return `${type}:${uid}`;
	}
	// /**
	//  * @param {string} uid 
	//  * @param {import('ws').WebSocket} client 
	//  */
	// registerEvents(uid, client) {
	// 	const listenerAdd = ({ _id, uid, status }) => {
	// 		if (client.readyState === client.OPEN) {
	// 			client.send(JSON.stringify({ type: 'add', id: _id, uid, status }));
	// 		}
	// 	};
	// 	this.on(this.eventKey('add', uid), listenerAdd);
	// 	const listenerUpdate = ({ _id, uid, status }) => {
	// 		if (client.readyState === client.OPEN) {
	// 			client.send(JSON.stringify({ type: 'update', id: _id, uid, status }));
	// 		}
	// 	};
	// 	this.on(this.eventKey('update', uid), listenerUpdate);
	// 	const listenerDelete = (_id) => {
	// 		if (client.readyState === client.OPEN) {
	// 			client.send(JSON.stringify({ type: 'delete', id: _id }));
	// 		}
	// 	};
	// 	this.on(this.eventKey('delete', uid), listenerDelete);
	// 	return () => {
	// 		this.removeListener(this.eventKey('add', uid), listenerAdd);
	// 		this.removeListener(this.eventKey('update', uid), listenerUpdate);
	// 		this.removeListener(this.eventKey('delete', uid), listenerDelete);
	// 	};
	// }
	/**
	 * @param {import('./api.js').PaintToken} token
	 * @param {string} owner
	 * @param {string} receiver
	 * @param {TokenStatus} status
	 */
	async addValidToken(token, owner, receiver, status) {
		const tokens = await this.database.tokens();
		log('add token owner=%s receiver=%s status=%s', owner, receiver, status);
		await tokens.updateOne({ owner }, { $set: { token, owner, receiver, status } }, { upsert: true });
	}
	/**
	 * @param {string} owner 
	 * @param {string} receiver 
	 */
	async updateToken(owner, receiver) {
		log('update token owner=%s receiver=%s', owner, receiver);
		const tokens = await this.database.tokens();
		await tokens.updateOne({ owner }, { owner, receiver });
	}
	/**
	 * @param {'owner'|'receiver'} type
	 * @param {string} uid 
	 */
	async currentTokens(type, uid) {
		const tokens = await this.database.tokens();
		const cursor = tokens.find({ [type]: uid });
		/**
		 @type {import('mongodb').WithId<{
			token:import('./api.js').PaintToken;
			owner:string;
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
	// /**
	//  * @param {import('http').Server | import('https').Server} server
	//  * @param {string} path
	//  */
	// makeTokenWSS(server, path) {
	// 	const wsServer = new Server({ noServer: true, path });
	// 	server.on('upgrade', async (req, /**@type {import('net').Socket}*/socket, head) => {
	// 		try {
	// 			if (wsServer.shouldHandle(req)) {
	// 				const authState = await this.authManager.getAuthState(req);
	// 				if (authState === null) {
	// 					throw new UserInputError('not logined');
	// 				}
	// 				const { uid } = authState;
	// 				wsServer.handleUpgrade(req, socket, head, client => {
	// 					this.currentTokens(uid)
	// 						.then(items => {
	// 							if (client.readyState !== client.OPEN) {
	// 								throw new Error('client is already closed');
	// 							}
	// 							client.send({
	// 								type: 'set',
	// 								statuses: items.map(item => ({
	// 									uid: item.uid,
	// 									status: item.status,
	// 								}))
	// 							});
	// 							const cancel = this.authManager.onLogout(uid, () => {
	// 								client.close();
	// 							});
	// 							const cancel2 = this.registerEvents(uid, client);
	// 							client.once('close', () => {
	// 								cancel();
	// 								cancel2();
	// 							});
	// 						})
	// 						.catch(error => {
	// 							log('error while connecting: %O', error);
	// 							if (client.readyState < client.CLOSING) {
	// 								client.close();
	// 							}
	// 						});
	// 				});
	// 			}
	// 		}
	// 		catch (error) {
	// 			if (!(error instanceof UserInputError)) {
	// 				log('error while connecting: %O', error);
	// 			}
	// 			socket.destroy();
	// 		}
	// 	});
	// }
	/**
	 * @returns {express.Handler[]}
	 */
	myTokensHandler() {
		return [
			...this.authManager.checkAndRequireAuth(),
			express.json({ limit: '5kb' }),
			(req, res, next) => {
				const { uid } = res.locals.auth;
				this.currentTokens('owner', uid)
					.then(tokens => {
						const result = tokens.map(x => ({ owner: x.owner, receiver: x.receiver, status: x.status }));
						res.json(result).end();
					})
					.catch(next);
			},
		];
	}
	/**
	 * @returns {express.Handler[]}
	 */
	uploadOrUpdateTokenHandler() {
		const ensureInput = ensure({
			type: 'object',
			entires: {
				token: {
					type: 'union',
					branches: [
						ensureToken,
						{ type: 'constant', value: undefined },
					]
				},
				receiver: ensureUID,
			},
		});
		const INVALID_COST = 30 * 1000;
		const ERROR_COST = 15 * 1000;
		const SUCCESS_COST = 5 * 1000;
		const rateLimiter = new RateLimiter(INVALID_COST * 5);
		return [
			...this.authManager.checkAndRequireAuth(),
			rateLimiter.handler(SUCCESS_COST),
			express.json({ limit: '5kb' }),
			async (req, res, next) => {
				try {
					const { uid } = res.locals.auth;
					const { token, receiver } = ensureInput(req.body);
					if (token !== undefined) {
						const result = await this.api.validateToken(token);
						if (result.ok) {
							const uid = this.userManager.getUIDByPaintToken(token, result);
							await this.addValidToken(token, uid, receiver, 'waiting');
							res.status(200).end();
						}
						else {
							rateLimiter.add(rateLimiter.key(req, res), INVALID_COST - SUCCESS_COST);
							res.status(401).send(result.reason).end();
						}
					}
					else {
						await this.updateToken(uid, receiver);
					}
				}
				catch (error) {
					rateLimiter.add(rateLimiter.key(req, res), ERROR_COST - SUCCESS_COST);
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
				this.currentTokens('receiver', uid)
					.then(tokens => {
						const result = tokens.map(x => ({ owner: x.owner, receiver: x.receiver, status: x.status }));
						res.json(result).end();
					})
					.catch(next);
			},
		];
	}
	router() {
		return express.Router()
			.get('/myTokens', this.myTokensHandler())
			.get('/tokensForMe', this.tokensForMeHandler())
			.post('/tokens', this.uploadOrUpdateTokenHandler());
	}
}