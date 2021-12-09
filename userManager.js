import express from 'express';
import cookieParser from 'cookie-parser';
import debug from 'debug';
import { Database } from './database.js';
import { ensure } from './ensure.js';
import { API } from './api.js';
import crypto from 'crypto';
import { ensureUUID } from '../utils/index.js';

const userLog = debug('drawer:user');

/**
@typedef {{
	
}} UserManagerConfig
 */

const ensureUID = ensure({ type: 'string', pattern: /^[1-9]\d{0,7}$/ });
export class UserManager {
	/**
	 * @param {{api:API,database:Database}} dependencies
	 * @param {UserManagerConfig} config
	 */
	constructor({ api, database }, { }) {
		this.api = api;
		this.database = database;
	}
	/**
	 * @returns {express.Handler[]}
	 */
	authMiddleware() {
		const ensureAuthToken = ensureUUID;
		return [
			/**@type {import('express').Handler}*/(cookieParser()),
			(req, res, next) => {
				const uid = ensureUID(req.cookies.uid);
				const authToken = ensureAuthToken(req.cookies.token);

				this.database.auth()
					.then(auth => auth.findOne({ token: authToken }))
					.then(document => {
						if (document === null || document.uid !== uid) {
							res.status(401).send('token 无效').end();
						}
						else {
							// TODO: update auth table
							res.locals.uid = uid;
							next();
						}
					})
					.catch(next);
			},
		];
	}
	/**
	 * @returns {express.Handler[]}
	 */
	login() {
		const ensureCID = ensure({ type: 'string', pattern: /^[0-9a-z]{40}$/ });
		return [
			express.json(),
			(req, res, next) => {
				const uid = ensureUID(req.body.uid);
				const clientID = ensureCID(req.body.clientID);
				userLog('login uid=%s', uid);
				this.api.isValidToken({ uid, clientID })
					.then(error => {
						if (error === null) {
							return this.database.auth()
								.then(async auth => {
									const token = crypto.randomUUID();
									res.status(200);
									res.cookie('uid', uid, { httpOnly: true, secure: true, path: '/api', sameSite: 'strict' });
									res.cookie('token', token, { httpOnly: true, secure: true, path: '/api', sameSite: 'strict' });
									await auth.insertOne({ token, uid, createdAt: new Date() });
									res.json({ uid }).end();
								});
						}
						else {
							userLog('login uid=%s failed: %s', error);
							res.status(401);
							res.cookie('uid', '', { httpOnly: true, secure: true, path: '/api', sameSite: 'strict' });
							res.cookie('token', '', { httpOnly: true, secure: true, path: '/api', sameSite: 'strict' });
							res.send(error).end();
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
			...this.authMiddleware(),
			(req, res, next) => {
				return this.database.auth().then(async auth => {
					const uid = res.locals.uid;
					await auth.deleteMany({ uid });
					userLog('logout uid=%s', uid);
					res.status(200);
					res.cookie('uid', '', { httpOnly: true, secure: true, path: '/api', sameSite: 'strict' });
					res.cookie('token', '', { httpOnly: true, secure: true, path: '/api', sameSite: 'strict' });
					res.json({}).end();
				}).catch(next);
			},
		];
	}
	router() {
		const router = express.Router();
		router.post('/login', this.login());
		router.post('/logout', this.logout());
		return router;
	}
}