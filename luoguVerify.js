import express from 'express';
import { ensure, UserInputError } from '../ensure';
import { createHash } from 'crypto';
import fetch from 'node-fetch';
import debug from 'debug';

const ensureUser = ensure({
	type: 'object',
	entires: {
		name: { type: 'string' },
		slogan: {
			type: 'union',
			branches: [
				{ type: 'string' },
				{ type: 'constant', value: null },
			]
		}
	}
});

/**
 * @param {string} uid
 */
async function getLuoguUser(uid) {
	const resp = await fetch(`https://www.luogu.com.cn/user/${uid}?_contentOnly=1`);
	if (!resp.ok) {
		throw new Error(`${resp.status} ${resp.statusText}`);
	}
	const json =/**@type {any}*/(await resp.json());
	if (json.currentTemplate !== 'UserShow') {
		throw new UserInputError('用户不存在');
	}
	const user = ensureUser(json.currentData.user);
	return user;
}

const ensureLuoguUID = ensure({ type: 'string', pattern: /^[1-9]\d{0,7}$/ });

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function isEqual(a, b) {
	if (a.length !== b.length) {
		return false;
	}
	const te = new TextEncoder();
	const aa = te.encode(a);
	const bb = te.encode(b);
	let ok = 1;
	for (let i = 0; i < a.length; i++) {
		ok &= aa[i] === bb[i] ? 1 : 0;
	}
	return ok === 1;
}

const log = debug('drawer:luogu-verify');

/**
 * @returns {express.Handler[]}
 */
export function luoguVerify() {
	const ensureInput = ensure({
		type: 'object',
		entires: {
			type: { type: 'constant', value: 'Luogu' },
			uid: ensureLuoguUID,
			secret: { type: 'string', pattern: /^[0-9a-f]{64}$/ },
		}
	});
	// const ensureSlogan = ensure({ type: 'string', pattern: /^\[Drawer\/auth\][a-zA-Z0-9\+\/]{43}=$/ });
	return [
		express.json({ limit: '5kb' }),
		(req, res, next) => {
			const { type, uid, secret } = ensureInput(req.body);
			log('login attempt uid=%s', uid);
			getLuoguUser(uid)
				.then(user => {
					const slogan = user.slogan || '';
					const hash = createHash('sha256');
					const shouldBe = '[Drawer/auth]' + hash.update(secret).digest('base64');
					if (isEqual(shouldBe, slogan)) {
						log('login attempt success uid=%s name=%s', uid, user.name);
						res.locals.verifyResult = { uid: `${uid}@Luogu`, name: user.name };
						next();
					}
					else {
						log('login attempt failed');
						throw new UserInputError('签名不符');
					}
				})
				.catch(next);
		},
	];
}