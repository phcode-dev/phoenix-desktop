import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const electronDir = join(__dirname, '..', 'src-electron');

console.log('Installing src-electron dependencies...');
execSync('npm ci', { cwd: electronDir, stdio: 'inherit' });
console.log('src-electron dependencies installed successfully!');
