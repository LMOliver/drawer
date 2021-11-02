import COLORS from './colors.json';

export function decode(data: ArrayBuffer) {
	const [height, width] = new Uint32Array(data, 0, 2);
	const size = height * width;
	const result = new Uint8ClampedArray(size * 4);
	// console.log(size, data.byteLength);
	const view = new DataView(data, 8);
	let index = 0;
	for (let i = 0; i < width; i++) {
		for (let j = 0; j < height; j++) {
			const color = COLORS[view.getUint8(index++)];
			for (let k = 0; k < 3; k++) {
				result[((j * width + i) << 2) | k] = color[k];
			}
			result[((j * width + i) << 2) | 3] = 255;
		}
	}
	return new ImageData(result, width, height);
}