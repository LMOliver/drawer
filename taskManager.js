import compression from 'compression';
import debug from 'debug';
import express from 'express';
import { ObjectId } from 'mongodb';
import { EventEmitter } from 'events';
import { ensure, UserInputError } from './ensure/index.js';
import { HEIGHT, WIDTH } from './constants.js';
import { Drawer } from './drawer.js';

const log = debug('drawer:task');

/**
 * @typedef {{width:number,height:number,data:string}} PaintImage
 */
const ensurePaintImage = (() => {
	const ensureImageFormat = ensure({
		type: 'object',
		entires: {
			width: { type: 'integer', min: 1, max: WIDTH },
			height: { type: 'integer', min: 1, max: HEIGHT },
			data: { type: 'string', pattern: /^[0-9a-v.]+$/ },
		}
	});
	/**
	 * @returns {PaintImage}
	 */
	return (/** @type {unknown} */ value) => {
		const { width, height, data } = ensureImageFormat(value);
		if (data.length !== width * height) {
			throw new UserInputError('data.length !== width * height');
		}
		return { width, height, data };
	};
})();

const ensureLeftTopFormat = ensure({
	type: 'object',
	entires: {
		x: { type: 'integer', min: 0, max: WIDTH - 1 },
		y: { type: 'integer', min: 0, max: HEIGHT - 1 },
	}
});

/**
 * @typedef {{leftTop:{x:number,y:number},weight:number}} TaskOption
 * @typedef {{image:PaintImage,options:TaskOption}} Task
 */

const ensureTaskOptionsFormat = ensure({
	type: 'object',
	entires: {
		leftTop: ensureLeftTopFormat,
		weight: { type: 'real', min: 0, max: 1e290 },
	}
});

/**
 * @param {Task} task 
 */
function doCheckValidTask(task) {
	if (task.options.leftTop.x + task.image.width > WIDTH) {
		throw new UserInputError('右边界超出绘板范围');
	}
	if (task.options.leftTop.y + task.image.height > HEIGHT) {
		throw new UserInputError('下边界超出绘板范围');
	}
}

const ensureTask = (() => {
	const ensureTaskFormat = ensure({
		type: 'object',
		entires: {
			image: ensurePaintImage,
			options: ensureTaskOptionsFormat,
		}
	});
	/**
	 * @returns {Task}
	 */
	return (/** @type {unknown} */ value) => {
		const task = ensureTaskFormat(value);
		doCheckValidTask(task);
		return task;
	};
})();

const ensureObjectId = (() => {
	const ensureObjectIdFormat = ensure({ type: 'string', pattern: /^[0-9a-f]{24}$/ });
	return (/** @type {unknown} */ value) => new ObjectId(ensureObjectIdFormat(value));
})();

/**
 * @param {{ width: number; height: number; }} image
 */
export function size(image) {
	return image.width * image.height;
}

export class TaskManager extends EventEmitter {
	/**
	 * @param {Drawer} dependencies 
	 * @param {{}} config 
	 */
	constructor({ authManager, userManager, tokenManager, database }, { }) {
		super();
		this.authManager = authManager;
		this.tokenManager = tokenManager;
		this.userManager = userManager;
		this.database = database;
		/**@type {Set<string>} */
		this.uploadingUsers = new Set();
	}
	/**
	 * @param {string} owner
	 * @param {Task} task
	 */
	async addTask(owner, task) {
		const taskSize = size(task.image);
		const release = await this.userManager.consumeResources(owner, { deltaCount: 1, deltaTotalSize: taskSize });
		try {
			const tasks = await this.database.tasks();
			const id = new ObjectId();
			await tasks.insertOne({ _id: id, owner, verified: false, ...task });
			log(
				'new task owner=%s size=%d*%d leftTop=(%d,%d) weight=%d id=%s',
				owner,
				task.image.width,
				task.image.height,
				task.options.leftTop.x,
				task.options.leftTop.y,
				task.options.weight,
				id.toHexString(),
			);
			this.emit('add', id);
			return id;
		}
		catch (error) {
			await release();
			throw error;
		}
	}
	/**
	 * @param {ObjectId} id
	 * @param {string} uid
	 * @param {TaskOption} options
	 */
	async updateTask(id, uid, options) {
		const tasks = await this.database.tasks();
		// console.log({
		// 	_id: id,
		// 	owner: uid,
		// 	'image.width': { $lte: WIDTH - options.leftTop.x },
		// 	'image.height': { $lte: HEIGHT - options.leftTop.y },
		// });
		const result = await tasks.updateOne({
			_id: id,
			owner: uid,
			'image.width': { $lte: WIDTH - options.leftTop.x },
			'image.height': { $lte: HEIGHT - options.leftTop.y },
		}, { $set: { options } });
		log(
			'update task owner=%s leftTop=(%d,%d) weight=%d id=%s',
			uid,
			options.leftTop.x,
			options.leftTop.y,
			options.weight,
			id.toHexString(),
		);
		// console.log(result);
		if (result.matchedCount === 1) {
			// ok
			log('updated successfully, %s', result.modifiedCount > 0 ? 'changed' : 'unchanged');
			if (result.modifiedCount > 0) {
				this.emit('update', id);
			}
			return;
		}
		else {
			throw new UserInputError('该任务已被删除');
		}
	}
	/**
	 * @param {ObjectId} id
	 * @param {string} uid
	 */
	async deleteTask(id, uid) {
		const tasks = await this.database.tasks();
		// console.log({
		// 	_id: id,
		// 	owner: uid,
		// 	'image.width': { $lte: WIDTH - options.leftTop.x },
		// 	'image.height': { $lte: HEIGHT - options.leftTop.y },
		// });
		const result = await tasks.findOneAndDelete({
			_id: id,
			owner: uid,
		});
		log(
			'delete task owner=%s id=%s',
			uid,
			id.toHexString(),
		);
		if (result.value !== null) {
			log('deleted successfully');
			await this.userManager.consumeResources(uid, { deltaCount: -1, deltaTotalSize: -size(result.value.image) });
			this.emit('delete', id);
		}
		else {
			throw new UserInputError('该任务已被删除');
		}
	}
	/**
	 * @returns {express.Handler[]}
	 */
	addTaskHandler() {
		return [
			...this.authManager.checkAndRequireAuth(),
			express.json({ limit: '100kb' }),
			(req, res, next) => {
				const { uid } = res.locals.auth;
				const task = ensureTask(req.body);
				this.addTask(uid, task)
					.then(id => {
						res.status(200).json({ id: id.toHexString() }).end();
					})
					.catch(next);
			}
		];
	}
	/**
	 * @returns {express.Handler[]}
	 */
	updateTaskHandler() {
		const ensureParams = ensure({
			type: 'object',
			entires: {
				id: ensureObjectId,
			}
		});
		const ensureBody = ensure({
			type: 'object',
			entires: {
				options: ensureTaskOptionsFormat,
			}
		});
		return [
			...this.authManager.checkAndRequireAuth(),
			express.json({ limit: '5kb' }),
			(req, res, next) => {
				const { uid } = res.locals.auth;
				const { id } = ensureParams(req.params);
				const { options } = ensureBody(req.body);
				this.updateTask(id, uid, options)
					.then(() => {
						res.status(200).end();
					})
					.catch(next);
			}
		];
	}
	/**
	 * @returns {express.Handler[]}
	 */
	deleteTaskHandler() {
		const ensureParams = ensure({
			type: 'object',
			entires: {
				id: ensureObjectId,
			}
		});
		return [
			...this.authManager.checkAndRequireAuth(),
			(req, res, next) => {
				const { uid } = res.locals.auth;
				const { id } = ensureParams(req.params);
				this.deleteTask(id, uid)
					.then(() => {
						res.status(200).end();
					})
					.catch(next);
			}
		];
	}
	/**
	 * @param {string} owner 
	 */
	async getTasks(owner) {
		const tasks = await this.database.tasks();
		const cursor = tasks.find({ owner }, { sort: [['weight', -1]] });
		let list = [];
		while (true) {
			const result = await cursor.next();
			if (result !== null) {
				const { _id: id, ...data } = result;
				list.push({ id, ...data });
			}
			else {
				cursor.close();
				break;
			}
		}
		return list;
	}
	async getAllTasks() {
		const tasks = await this.database.tasks();
		const cursor = tasks.find({});
		let items = [];
		while (true) {
			const result = await cursor.next();
			if (result !== null) {
				items.push(result);
			}
			else {
				cursor.close();
				break;
			}
		}
		return items;
	}
	async getAllTaskIDs() {
		const tasks = await this.database.tasks();
		const cursor = tasks.aggregate([{ $project: { _id: '$_id' } }]);
		let items = [];
		while (true) {
			const result = await cursor.next();
			if (result !== null) {
				items.push(result);
			}
			else {
				cursor.close();
				break;
			}
		}
		return items;
	}
	/**
	 * @returns {express.Handler[]}
	 */
	getTasksHandler() {
		return [
			...this.authManager.checkAndRequireAuth(),
			compression(),
			(req, res, next) => {
				const { uid } = res.locals.auth;
				this.getTasks(uid)
					.then(result => {
						res.status(200).json(result.map(
							({ id, image, options }) => ({ id: id.toHexString(), image, options }))
						).end();
					})
					.catch(next);
			}
		];
	}
	router() {
		return express.Router()
			.post('/tasks', this.addTaskHandler())
			.post('/task/:id', this.updateTaskHandler())
			.delete('/task/:id', this.deleteTaskHandler())
			.get('/tasks', this.getTasksHandler());
	}
}