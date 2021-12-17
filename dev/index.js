import { createServer } from 'vite';
import { Drawer } from '../drawer.js';
import { config } from './config.js';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import vuePlugin from '@vitejs/plugin-vue';

async function main() {
	const drawer = new Drawer(config());
	// @ts-ignore for import.meta
	const root = resolve(fileURLToPath(import.meta.url), '../../../website');
	// console.log(root);
	const devServer = await createServer({
		root,
		server: {
			middlewareMode: 'html',
		},
	});
	drawer.server.app.use(devServer.middlewares);
}
main();