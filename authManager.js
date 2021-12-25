// TODO: update

import express from 'express';
import debug from 'debug';
import { ensure, UserInputError, ensureUUID } from './ensure/index.js';
import crypto from 'crypto';
import { rateLimiter } from './rateLimiter.js';
import EventEmitter from 'events';
import { Drawer } from './drawer.js';
import { luoguVerify } from './luoguVerify.js';

const log = debug('drawer:auth');

/**
@typedef {{
	
}} AuthManagerConfig
 */

export const ensureUID = ensure({ type: 'string', pattern: /^[1-9]\d{0,7}@Luogu$/ });

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
	 * @param {import('http').IncomingMessage} req 
	 * @returns {Promise<{uid:string,name:string}|null>}
	 */
	async getUser(req) {
		try {
			const cookies = parseCookies(ensureCookies(req.headers.cookie));
			const { uid, 'auth-token': authToken } = ensureAuthInput(cookies);
			const auth = await this.database.auth();
			const document = await auth.findOne({ token: authToken });
			if (document === null || document.uid !== uid) {
				return null;
			}
			else {
				const users = await this.database.users();
				const user = await users.findOne({ uid });
				if (user === null) {
					return null;
				}
				// TODO: update auth table
				return { uid: user.uid, name: user.name };
			}
		}
		catch (error) {
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
				this.getUser(req)
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
	registerOrLoginWithLuogu() {
		return [
			express.json({ limit: '5kb' }),
			rateLimiter(5000, 2),
			rateLimiter(30 * 1000, 5),
			...luoguVerify(),
			(req, res, next) => {
				const { uid, name } = res.locals.verifyResult;
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
						await this.userManager.createUserIfNotExist({ uid, name });
						await auth.insertOne({ token: authToken, uid, createdAt: new Date() });
						res.json({ uid, name }).end();
					})
					.catch(next);
			}
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
					// this.emit(this.logoutEventName(uid));
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
				const result = res.locals.auth && { uid: res.locals.auth.uid, name: res.locals.auth.name };
				res.json(result).end();
			},
		];
	}
	router() {
		const router = express.Router();
		router.post('/auth', this.registerOrLoginWithLuogu());
		router.delete('/auth', this.logout());
		router.get('/auth', this.state());
		return router;
	}
}