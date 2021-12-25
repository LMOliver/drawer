export class UserInputError extends Error { };

/**
 * @type {(value:unknown)=>string} 
 */
const ensureCommonString = value => {
	if (typeof value !== 'string') {
		throw new UserInputError('the argument is not a string');
	}
	return value;
};

/**
 * @template {import('./index.js').Constant} T
 * @param {T} x 
 * @returns {(value:unknown)=>T}
 */
const ensureConstant = x => {
	return value => {
		if (Object.is(value, x)) {
			return x;
		}
		else {
			throw new UserInputError(`the argument is not equal to ${x}`);
		}
	};
};

/**
 * @param {import('./index.js').EValue} item 
 * @returns {(value:unknown)=>any}
 */
function ensureDict(item) {
	const ensureItem = ensure(item);
	return value => {
		if (typeof value !== 'object') {
			throw new UserInputError('the argument is not an object');
		}
		if (value === null) {
			throw new UserInputError('the argument is null');
		}
		return Object.fromEntries(Object.entries(value).map(([key, value]) => [key, /**@type {any}*/(ensureItem)(value)]));
	};
}

/**
 * @param {RegExp|undefined} pattern
 * @returns {(value:unknown)=>string} 
 */
function ensureString(pattern) {
	if (!pattern) {
		return ensureCommonString;
	}
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
 * @template {import('./index.js').EValue} T
 * @param {number} maxLength 
 * @param {T} item 
 * @returns {(value:unknown)=>import('./index.js').ETransform<{type:'array',maxLength:number,item:T}>}
 */
function ensureArray(maxLength, item) {
	const ensureItem = _ensure(item);
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
 * @template {{[key:string]:import('./index.js').EValue}} T
 * @param {T} entires 
 * @returns {(value:unknown)=>any}
 */
function ensureObject(entires) {
	/**
	 * @type {[string,function][]}
	 */
	const keys = Object.entries(entires).map(([key, value]) => [key, _ensure(value)]);
	return value => {
		if (typeof value !== 'object') {
			throw new UserInputError('the argument is not an object');
		}
		if (value === null) {
			throw new UserInputError('the argument is null');
		}
		return Object.fromEntries(keys.map(([key, e]) => {
			if (Object.prototype.hasOwnProperty.call(value, key)) {
				return [key, e(value[key])];
			}
			else {
				throw new UserInputError(`key ${key} doesn't exist in the argument`);
			}
		}));
	};
}

/**
 * @param {readonly import('./index.js').EValue[]} branches 
 * @returns {(value:unknown)=>any}
 */
function ensureUnion(branches) {
	const es = branches.map(v => _ensure(v));
	return value => {
		for (const e of es) {
			try {
				// @ts-ignore
				return e(value);
			}
			catch (error) { }
		}
		throw new UserInputError('the argument doesn\'t satisify any of the branches');
	};
}

/**
 * @template {import('./index.js').EValue} T
 * @param {T} type 
 * @returns {(value:unknown)=>import('./index.js').ETransform<T>}
 */
function _ensure(type) {
	if (typeof type === 'function') {
		return type;
	}
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
		case 'union': {
			return /**@type {any}*/(ensureUnion(type.branches));
		}
		case 'constant': {
			return /**@type {any}*/(ensureConstant(type.value));
		}
		case 'dict': {
			return /**@type {any}*/(ensureDict(type.value));
		}
	}
}

/**
 * @template {import('./index.js').EValue} T
 * @param {T} type 
 * @returns {(value:unknown)=>import('./index.js').ETransform<T>}
 */
export function ensure(type) {
	const checker = _ensure(type);
	return (value) => {
		// try {
		return checker(value);
		// }
		// catch (error) {
		// 	throw Object.assign(error, { value, type });
		// }
	};
}

const qwq = ensure({ type: 'string', pattern: /^[0-9a-f]{8}\-[0-9a-f]{4}\-[0-9a-f]{4}\-[0-9a-f]{4}\-[0-9a-f]{12}$/i });
/**
 * @param {unknown} value 
 */
export const ensureUUID = value => qwq(value).toLowerCase();