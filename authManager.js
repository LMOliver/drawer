import express from 'express';
import cookieParser from 'cookie-parser';
import debug from 'debug';
import { Database } from './database.js';
import { ensure, UserInputError } from '../ensure';
import { API } from './api.js';
import crypto from 'crypto';
import { ensureUUID } from '../utils/index.js';
import { UserManager } from './userManager.js';
import { rateLimiter } from './rateLimiter.js';
import EventEmitter from 'events';
import { Drawer } from './drawer.js';

const log = debug('drawer:auth');

/**
@typedef {{
	
}} AuthManagerConfig
 */

export const ensureUID = ensure({ type: 'string', pattern: /^[1-9]\d{0,7}@Luogu$/ });
const ensureLuoguUID = ensure({ type: 'string', pattern: /^[1-9]\d{0,7}$/ });
export const ensureToken = ensure({
	type: 'object',
	entires: {
		uid: ensureLuoguUID,
		clientID: { type: 'string', pattern: /^[0-9a-z]{40}$/ },
	}
});
const ensureCookies = ensure({ type: 'string', pattern: /^(?:|(?:[^=; ]+=[^=; ]*(?:; |$))*)$/ });
/**
 * @param {string} rawCookies
 */
function parseCookies(rawCookies) {
	return Object.fromEntries(
		rawCookies
			.split('; ')
			.map(x => x.split('=', 2))
			.filter(x => x.length === 2)
			.map(([key, value]) => [key, decodeURIComponent(value)])
	);
}
const ensureAuthToken = ensureUUID;
const ensureAuthInput = ensure({
	type: 'object',
	entires: {
		uid: ensureUID,
		'auth-token': ensureAuthToken,
	}
});
export class AuthManager extends EventEmitter {
	/**
	 * @param {Drawer} drawer
	 * @param {AuthManagerConfig} config
	 */
	constructor(drawer, { }) {
		super();
		this.drawer = drawer;
		const { api, database, userManager } = this.drawer;
		this.api = api;
		this.database = database;
		this.userManager = userManager;
	}
	/**
	 * @param {string} uid 
	 */
	logoutEventName(uid) {
		return `logout:${uid}`;
	}
	/**
	 * @param {string} uid 
	 * @param {()=>void} callback 
	 */
	onLogout(uid, callback) {
		this.on(this.logoutEventName(uid), callback);
		return () => {
			this.removeListener(this.logoutEventName(uid), callback);
		};
	}
	/**
	 * @param {import('http').IncomingMessage} req 
	 * @returns {Promise<{uid:string}|null>}
	 */
	async getAuthState(req) {
		try {
			// console.log(req.headers.cookie);
			const cookies = parseCookies(ensureCookies(req.headers.cookie));
			// console.log(cookies);
			const { uid, 'auth-token': authToken } = ensureAuthInput(cookies);
			const auth = await this.database.auth();
			const document = await auth.findOne({ token: authToken });
			if (document === null || document.uid !== uid) {
				return null;
			}
			else {
				// TODO: update auth table
				return { uid };
			}
		}
		catch (error) {
			// console.log(error);
			if (error instanceof UserInputError) {
				return null;
			}
			else {
				throw error;
			}
		}
	}
	/**
	 * @returns {express.Handler[]}
	 */
	checkAuth() {
		return [
			// /**@type {import('express').Handler}*/(cookieParser()),
			(req, res, next) => {
				this.getAuthState(req)
					.then(result => {
						res.locals.auth = result;
						next();
					})
					.catch(next);
			},
		];
	}
	/**
	 * @returns {express.Handler[]}
	 */
	checkAndRequireAuth() {
		return [
			...this.checkAuth(),
			(req, res, next) => {
				if (res.locals.auth !== null) {
					next();
				}
				else {
					res.status(401).send('没有登录').end();
				}
			},
		];
	}
	/**
	 * @returns {express.Handler[]}
	 */
	registerOrLoginWithToken() {
		const ensureInput = ensure({
			type: 'object',
			entires: {
				type: { type: 'constant', value: 'luogu-paint-token' },
				token: ensureToken,
			},
		});
		return [
			express.json({ limit: '5kb' }),
			rateLimiter(30 * 1000, 3),
			(req, res, next) => {
				const { type, token } = ensureInput(req.body);
				log('login attempt');
				this.api.validateToken(token)
					.then(result => {
						if (result.ok) {
							const uid = this.userManager.getUIDByPaintToken(token, result);
							log('login attempt success: uid=%s', result.uid);
							return this.database.auth()
								.then(async auth => {
									const authToken = crypto.randomUUID();
									res.status(200);
									/**
									 * @type {import('express').CookieOptions}
									 */
									const addCookie = { httpOnly: true, secure: true, path: '/api', sameSite: 'strict' };
									res.cookie('uid', uid, addCookie);
									res.cookie('auth-token', authToken, addCookie);
									if (await this.userManager.createUserIfNotExist(uid)) {
										if (type === 'luogu-paint-token') {
											await this.drawer.tokenManager.addValidToken(token, uid, uid, 'waiting');
										}
									}
									await auth.insertOne({ token: authToken, uid, createdAt: new Date() });
									res.json({ uid }).end();
								});
						}
						else {
							log('login attempt failed: %s', result.reason);
							res.status(401);
							/**
							 * @type {import('express').CookieOptions}
							 */
							const removeCookie = { httpOnly: true, secure: true, path: '/api', sameSite: 'strict', expires: new Date(0) };
							res.cookie('uid', '', removeCookie);
							res.cookie('auth-token', '', removeCookie);
							res.send(result.reason).end();
						}
					})
					.catch(next);
			},
		];
	}
	/**
	 * @returns {express.Handler[]}
	 */
	logout() {
		return [
			...this.checkAndRequireAuth(),
			(req, res, next) => {
				return this.database.auth().then(async auth => {
					const uid = res.locals.auth.uid;
					await auth.deleteMany({ uid });
					this.emit(this.logoutEventName(uid));
					log('logout uid=%s', uid);
					res.status(200);
					/**
					 * @type {import('express').CookieOptions}
					 */
					const removeCookie = { httpOnly: true, secure: true, path: '/api', sameSite: 'strict', expires: new Date(0) };
					res.cookie('uid', '', removeCookie);
					res.cookie('auth-token', '', removeCookie);
					res.json({}).end();
				}).catch(next);
			},
		];
	}
	/**
	 * @returns {express.Handler[]}
	 */
	state() {
		return [
			...this.checkAuth(),
			(req, res) => {
				const result = res.locals.auth && { uid: res.locals.auth.uid };
				res.json(result).end();
			},
		];
	}
	router() {
		const router = express.Router();
		router.post('/token', this.registerOrLoginWithToken());
		router.post('/logout', this.logout());
		router.get('/state', this.state());
		return router;
	}
}