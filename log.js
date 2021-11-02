import chalk from 'chalk';

const COLORS = [
	[0, 0, 0], [255, 255, 255], [170, 170, 170], [85, 85, 85],
	[254, 211, 199], [255, 196, 206], [250, 172, 142], [255, 139, 131],
	[244, 67, 54], [233, 30, 99], [226, 102, 158], [156, 39, 176],
	[103, 58, 183], [63, 81, 181], [0, 70, 112], [5, 113, 151],
	[33, 150, 243], [0, 188, 212], [59, 229, 219], [151, 253, 220],
	[22, 115, 0], [55, 169, 60], [137, 230, 66], [215, 255, 7],
	[255, 246, 209], [248, 203, 140], [255, 235, 59], [255, 193, 7],
	[255, 152, 0], [255, 87, 34], [184, 63, 39], [121, 85, 72]
];

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
	return `Day ${date.getDate()} ${qwq(date.getHours())}:${qwq(date.getMinutes())}:${qwq(date.getSeconds())}.${qwq(Math.floor(date.getMilliseconds() / 10))}`;
}