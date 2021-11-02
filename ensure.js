/**
 * @param {unknown} value 
 * @returns {string} 
 */
export function ensureString(value) {
	if (typeof value !== 'string') {
		throw new TypeError('the argument is not a string');
	}
	return value;
}
/**
 * @param {unknown} value 
 * @returns {number} 
 */
export function ensureNumber(value, min = -Infinity, max = Infinity) {
	if (typeof value !== 'number') {
		throw new TypeError('the argument is not a number');
	}
	if (Number.isNaN(value)) {
		throw new TypeError('the argument is nan');
	}
	if (min <= value && value <= max) {
		return value;
	}
	else {
		throw new TypeError('the argument is out of range');
	}
}
/**
 * @param {unknown} value 
 * @returns {number} 
 */
export function ensureInteger(value, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
	if (typeof value !== 'number') {
		throw new TypeError('the argument is not a number');
	}
	if (!Number.isSafeInteger(value)) {
		throw new TypeError('the argument is not an integer');
	}
	if (min <= value && value <= max) {
		return value;
	}
	else {
		throw new TypeError('the argument is out of range');
	}
}