import { config } from './config.js';
import { Drawer } from './drawer.js';
// import { build } from 'vite';
// import vuePlugin from '@vitejs/plugin-vue';
import express from 'express';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

async function main() {
	// @ts-ignore for import.meta
	const root = resolve(fileURLToPath(import.meta.url), '../../website/deploy/public');
	console.log(root);
	const drawer = new Drawer(config());
	drawer.server.app.use(express.static(root));
}
main();