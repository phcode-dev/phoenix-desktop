import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get source path from command line argument
const srcNodeSource = process.argv[2];
if (!srcNodeSource) {
    console.error('Usage: node makeSrcNode.js <src-node-path>');
    console.error('Example: node makeSrcNode.js ../phoenix/src-node');
    process.exit(1);
}

const targets = [
    join(__dirname, '..', 'src-tauri', 'src-node'),
    join(__dirname, '..', 'src-electron', 'src-node')
];

function setupTarget(srcPath, destPath) {
    console.log(`\nSetting up ${destPath}...`);

    // Remove existing and copy from source
    execSync(`shx rm -rf ${destPath}`, { stdio: 'inherit' });
    execSync(`shx cp -r ${srcPath} ${destPath}`, { stdio: 'inherit' });

    // Install production dependencies
    console.log('Installing production dependencies...');
    execSync('npm ci --production', { cwd: destPath, stdio: 'inherit' });

    // Remove unsupported musl binaries
    console.log('Removing unsupported musl binaries...');
    execSync(`shx rm -f ${destPath}/node_modules/@msgpackr-extract/msgpackr-extract-linux-*/*.musl.node`, { stdio: 'pipe' });
    execSync(`shx rm -f ${destPath}/node_modules/@lmdb/lmdb-linux-*/*.musl.node`, { stdio: 'pipe' });

    console.log(`${destPath} setup complete!`);
}

function main() {
    const absoluteSrc = join(process.cwd(), srcNodeSource);

    for (const target of targets) {
        setupTarget(absoluteSrc, target);
    }

    console.log('\nAll targets setup successfully!');
}

main();
