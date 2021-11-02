import { config } from './config.js';
import { Drawer } from './drawer.js';
import { build } from 'vite';
import vuePlugin from '@vitejs/plugin-vue';
import express from 'express';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

async function main() {
	// @ts-ignore for import.meta
	const root = resolve(fileURLToPath(import.meta.url), '../client');
	await build({
		configFile: false,
		root,
		build: {
			outDir: './dist',
		},
		plugins: [
			vuePlugin(),
		],
	});
	const drawer = new Drawer(config());
	drawer.server.app.use(express.static(resolve(root, './dist')));
}
main();