export class UserInputError extends Error { };

/**
 * @param {RegExp} pattern
 * @returns {(value:unknown)=>string} 
 */
function ensureString(pattern) {
	if (pattern.toString().includes('^') && pattern.toString().includes('$')) {
		return value => {
			if (typeof value !== 'string') {
				throw new UserInputError('the argument is not a string');
			}
			if (!pattern.test(value)) {
				throw new UserInputError('the argument doesn\'t match the pattern');
			}
			return value;
		};
	}
	else {
		throw new TypeError('the regexp must match the whole string');
	}
}

/**
 * @param {number} min
 * @param {number} max
 * @returns {(value:unknown)=>number} 
 */
function ensureReal(min, max) {
	return value => {
		if (typeof value !== 'number') {
			throw new UserInputError('the argument is not a number');
		}
		if (Number.isNaN(value)) {
			throw new UserInputError('the argument is nan');
		}
		if (min <= value && value <= max) {
			return value;
		}
		else {
			throw new UserInputError('the argument is out of range');
		}
	};
}
/**
 * @param {number} min
 * @param {number} max
 * @returns {(value:unknown)=>number} 
 */
function ensureInteger(min, max) {
	return value => {
		if (typeof value !== 'number') {
			throw new UserInputError('the argument is not a number');
		}
		if (!Number.isSafeInteger(value)) {
			throw new UserInputError('the argument is not an integer');
		}
		if (min <= value && value <= max) {
			return value;
		}
		else {
			throw new UserInputError('the argument is out of range');
		}
	};
}

/**
 * @param {unknown} value 
 */
function ensureBoolean(value) {
	if (typeof value !== 'boolean') {
		throw new UserInputError('the argument is not a boolean');
	}
	return value;
}

/**
 * @template {import('./ensure.js').EValue} T
 * @param {number} maxLength 
 * @param {T} item 
 * @returns {(value:unknown)=>import('./ensure.js').ETransform<{type:'array',maxLength:number,item:T}>}
 */
function ensureArray(maxLength, item) {
	const ensureItem = ensure(item);
	return value => {
		if (!Array.isArray(value)) {
			throw new UserInputError('the argument is not an array');
		}
		if (value.length > maxLength) {
			throw new UserInputError('the array is too long');
		}
		return value.map(ensureItem);
	};
}

/**
 * @template {{[key:string]:import('./ensure.js').EValue}} T
 * @param {T} entires 
 * @returns {(value:unknown)=>any}
 */
function ensureObject(entires) {
	/**
	 * @type {[string,function][]}
	 */
	const keys = Object.entries(entires).map(([key, value]) => [key, ensure(value)]);
	return value => {
		if (typeof value !== 'object' || value === null) {
			throw new UserInputError('the argument is not an object');
		}
		return Object.fromEntries(keys.map(([key, e]) => [key, e(value[key])]));
	};
}

/**
 * @template {import('./ensure.js').EValue} T
 * @param {T} type 
 * @returns {(value:unknown)=>import('./ensure.js').ETransform<T>}
 */
export function ensure(type) {
	switch (type.type) {
		case 'real': {
			return /**@type {any}*/(ensureReal(type.min, type.max));
		}
		case 'integer': {
			return /**@type {any}*/(ensureInteger(type.min, type.max));
		}
		case 'boolean': {
			return /**@type {any}*/(ensureBoolean);
		}
		case 'string': {
			return /**@type {any}*/(ensureString(type.pattern));
		}
		case 'array': {
			return /**@type {any}*/(ensureArray(type.maxLength, type.item));
		}
		case 'object': {
			return /**@type {any}*/(ensureObject(type.entires));
		}
	}
}