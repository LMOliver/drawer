import debug from 'debug';
import express from 'express';
import { currentTime } from './time.js';

const log = debug('drawer:ratelimiter');

export class RateLimiter {
	/**
	 * @param {number} bucketSize 
	 */
	constructor(bucketSize) {
		this.bucketSize = bucketSize;

		/**
		 * @type {Map<string,number>}
		 */
		this.bucket = new Map();
		const CLEAN_INTERVAL = 60 * 1000;
		setTimeout(() => {
			this.clean();
			setInterval(() => {
				this.clean();
			}, CLEAN_INTERVAL);
		}, Math.random() * CLEAN_INTERVAL);
	}
	clean() {
		const current = currentTime();
		for (const [key, value] of this.bucket) {
			if (current - value >= this.bucketSize) {
				this.bucket.delete(key);
			}
		}
	}
	/**
	 * @param {express.Request} req
	 * @param {express.Response} res 
	 */
	key(req, res) {
		return res.locals.auth ? 'user,' + res.locals.auth.uid : 'anonymous,' + req.ip;
	}
	/**
	 * @param {string} key 
	 */
	get(key) {
		return this.bucket.get(key) || 0;
	}
	/**
	 * @param {string} key
	 * @param {number} value
	 */
	add(key, value) {
		this.bucket.set(key, Math.min(this.get(key) + value, currentTime()));
	}
	/**
	 * @param {express.Request} req
	 * @param {express.Response} res
	 * @param {() => void} next
	 * @param {number} cost
	 */
	handle(req, res, next, cost) {
		const now = currentTime();
		const key = this.key(req, res);
		const target = Math.max(this.get(key), now - this.bucketSize) + cost;
		if (target <= now) {
			this.bucket.set(key, target);
			next();
		}
		else {
			log('rate limit triggered with key=%s', key);
			const seconds = Math.ceil((target - now) / 1000 + 0.1);
			res
				.status(429)
				.setHeader('Retry-After', seconds.toString(10))
				.send(`请求过于频繁，请过 ${seconds} 秒再试`).end();
		}
	}
	/**
	 * @param {number} costPerAction 
	 * @returns {express.Handler}
	 */
	handler(costPerAction) {
		return (req, res, next) => {
			this.handle(req, res, next, costPerAction);
		};
	}
}

/**
 * @returns {express.Handler}
 * @param {number} timePerAction
 * @param {number} bucketedActionCount
 */
export function rateLimiter(timePerAction, bucketedActionCount) {
	return new RateLimiter(timePerAction * bucketedActionCount).handler(timePerAction);
}