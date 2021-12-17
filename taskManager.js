import express from 'express';
import { UserInputError } from '../ensure/index.js';
import { AuthManager } from './authManager.js';
import { Database } from './database.js';

export class ImageManager {
	/**
	 * @param {{authManager:AuthManager, database:Database}} dependencies 
	 * @param {{}} config 
	 */
	constructor({ authManager, database }, { }) {
		this.authManager = authManager;
		this.database = database;
		/**@type {Set<string>} */
		this.uploadingUsers = new Set();
	}
	/**
	 * @returns {express.Handler[]}
	 */
	imagesToUpload() {
		return [
			...this.authManager.checkAndRequireAuth(),
			async (req, res, next) => {
				try {
					const uid = res.locals.auth.uid;
					const images = await this.database.images();
				}
				catch (error) {
					next(error);
				}
			}
		];
	}
	/**
	 * @returns {express.Handler[]}
	 */
	uploadImage() {
		return [
			...this.authManager.checkAndRequireAuth(),
			express.raw({ type: 'application/octet-stream', limit: '1mb' }),
			async (req, res, next) => {
				req.body;
				const uid = res.locals.auth.uid;
				try {
					if (this.uploadingUsers.has(uid)) {
						throw new UserInputError('不能同时上传多张图像');
					}
					try {
						this.uploadingUsers.add(uid);
						const tasks = await this.database.tasks();
						const count = await images.countDocuments({});
					}
					finally {
						this.uploadingUsers.delete(uid);
					}
				}
				catch (error) {
					next(error);
				}
			}
		];
	}
}