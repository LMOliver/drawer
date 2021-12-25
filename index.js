import { config } from './config.js';
import { Drawer } from './drawer.js';

async function main() {
	new Drawer(config());
}
main();