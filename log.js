import chalk from 'chalk';
import { COLORS } from './constants.js';

const RENDERS = COLORS.map(([r, g, b]) => (r + g + b < 128 ? chalk.white : chalk.black).bgRgb(r, g, b));

/**
 * @param {number} color
 */
export function colorRenderer(color) {
	return RENDERS[color] || chalk.white;
}

/**
 * @param {number} color
 */
export function showColor(color) {
	return colorRenderer(color)(color.toString(10).padStart(2, ' '));
}

/**
 * @param {number} time 
 */
export function showTime(time) {
	const date = new Date(time);
	/**
	 * @param {number} x 
	 */
	const qwq = x => x.toString().padStart(2, '0');
	return `${date.getFullYear()}/${date.getMonth()+1}/${date.getDay()} ${qwq(date.getHours())}:${qwq(date.getMinutes())}:${qwq(date.getSeconds())}.${qwq(Math.floor(date.getMilliseconds() / 10))}`;
}