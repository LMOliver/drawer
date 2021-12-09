import { createServer } from 'vite';
import { Drawer } from '../drawer.js';
import { config } from './config.js';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import vuePlugin from '@vitejs/plugin-vue';

async function main() {
	const drawer = new Drawer(config());
	const devServer = await createServer({
		root: '../website',
		server: {
			middlewareMode: 'html',
		},
	});
	drawer.server.app.use(devServer.middlewares);
}
main();