import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { copyFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const electronDir = join(__dirname, '..', 'src-electron');

console.log('Installing src-electron dependencies...');
execSync('npm ci', { cwd: electronDir, stdio: 'inherit' });
console.log('src-electron dependencies installed successfully!');

// Copy config.json to config-effective.json (dev config by default)
const configSrc = join(electronDir, 'config.json');
const configDest = join(electronDir, 'config-effective.json');
console.log('Copying config.json to config-effective.json...');
copyFileSync(configSrc, configDest);
console.log('Config file copied successfully!');
