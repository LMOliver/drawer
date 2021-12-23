/**
 * @template {number} T
 */
export class RandomSet {
	constructor() {
		/**@type {T[]} */
		this.list = [];
		this.set = Object.create(null);
	}
	/**
	 * @param {T} item
	 */
	push(item) {
		if (!this.set[item]) {
			this.set[item] = true;
			this.list.push(item);
		}
	}
	get size() {
		return this.list.length;
	}
	_popRandom() {
		if (this.list.length === 0) {
			throw new Error('the set is empty');
		}
		const index = Math.floor(Math.random() * this.list.length);
		if (index === this.list.length - 1) {
			return /**@type {T}*/(this.list.pop());
		}
		else {
			const item = this.list[index];
			this.list[index] = /**@type {T}*/(this.list.pop());
			return item;
		}
	}
	popRandom() {
		const item = this._popRandom();
		delete this.set[item];
		return item;
	}
}