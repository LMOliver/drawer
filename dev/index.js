import { Drawer } from '../drawer.js';
import { config } from './config.js';

async function main() {
	new Drawer(config());
}
main();