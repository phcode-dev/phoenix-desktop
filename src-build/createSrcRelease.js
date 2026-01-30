import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import * as os from 'os';
import chalk from 'chalk';
import { getPlatformDetails } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Parse command line args
const args = process.argv.slice(2);
const isDebug = args.includes('--debug');
const { platform } = getPlatformDetails();

// Determine target from CLI or auto-detect
let target;
if (args.includes('electron')) {
    target = 'electron';
} else if (args.includes('tauri')) {
    target = 'tauri';
} else {
    // Auto-detect: Linux uses Electron, Windows/Mac use Tauri
    target = (platform === 'linux') ? 'electron' : 'tauri';
}

// Print override instructions
console.log(chalk.cyan('\n=== Phoenix Code Release Build ===\n'));
console.log(`Platform: ${platform}, Target: ${target}${isDebug ? ' (debug)' : ''}\n`);
console.log(chalk.gray('To force a different target:'));
console.log(chalk.gray(`  npm run releaseSrc -- tauri      # Force Tauri build`));
console.log(chalk.gray(`  npm run releaseSrc -- electron   # Force Electron build`));
console.log(chalk.gray(`  npm run releaseSrcDebug -- tauri # Force Tauri debug build\n`));

// Warn about non-standard platform/target combinations
const recommendedTarget = (platform === 'linux') ? 'electron' : 'tauri';
if (target !== recommendedTarget) {
    const y = chalk.yellow;
    const b = chalk.bold.yellow;
    const line1 = `  Building ${target} on ${platform} is not officially supported.`;
    const line2 = `  Recommended: npm run releaseSrc (auto-detects ${recommendedTarget} for ${platform})`;
    const width = Math.max(50, line1.length, line2.length) + 2;
    const border = '═'.repeat(width);
    const pad = (str) => str + ' '.repeat(width - str.length);

    console.warn(y(`╔${border}╗`));
    console.warn(y('║') + b(pad('  ⚠️  NON-STANDARD PLATFORM CONFIGURATION')) + y('║'));
    console.warn(y(`╠${border}╣`));
    console.warn(y('║') + y(pad(line1)) + y('║'));
    console.warn(y('║') + y(pad(line2)) + y('║'));
    console.warn(y(`╚${border}╝\n`));
}

function run(cmd, options = {}) {
    console.log(chalk.blue(`> ${cmd}`));
    execSync(cmd, { stdio: 'inherit', ...options });
}

function setupSrcNode(targetDir) {
    console.log(chalk.cyan('\n=== Setting up src-node ===\n'));
    const srcNodeSource = join(projectRoot, '..', 'phoenix', 'src-node');
    const destPath = join(projectRoot, targetDir, 'src-node');

    console.log(`Setting up ${destPath}...`);
    run(`shx rm -rf "${destPath}"`);
    run(`shx cp -r "${srcNodeSource}" "${destPath}"`);
    console.log('Installing production dependencies...');
    execSync('npm ci --production', { cwd: destPath, stdio: 'inherit' });
    // Remove unsupported musl binaries
    execSync(`shx rm -f "${destPath}/node_modules/@msgpackr-extract/msgpackr-extract-linux-*/*.musl.node"`, { stdio: 'pipe' });
    execSync(`shx rm -f "${destPath}/node_modules/@lmdb/lmdb-linux-*/*.musl.node"`, { stdio: 'pipe' });
}

function createTauriConfig() {
    console.log(chalk.cyan('\n=== Creating Tauri Config ===\n'));
    const tauriConfigPath = join(projectRoot, 'src-tauri', 'tauri.conf.json');
    const tauriLocalConfigPath = join(projectRoot, 'src-tauri', 'tauri-local.conf.json');

    console.log('Reading config file:', tauriConfigPath);
    let configJson = JSON.parse(fs.readFileSync(tauriConfigPath));

    console.log(chalk.cyan('!Only creating executables. Installers are disabled.\n'));
    configJson.tauri.bundle.active = false;
    configJson.build.distDir = '../../phoenix/src/';

    const phoenixVersion = configJson.package.version;
    if (os.platform() === 'win32') {
        configJson.tauri.windows[0].url = `https://phtauri.localhost/v${phoenixVersion}/`;
        configJson.tauri.windows[2].url = `https://phtauri.localhost/v${phoenixVersion}/drop-files.html`;
    } else {
        configJson.tauri.windows[0].url = `phtauri://localhost/v${phoenixVersion}/`;
        configJson.tauri.windows[2].url = `phtauri://localhost/v${phoenixVersion}/drop-files.html`;
    }

    if (os.platform() === 'darwin') {
        configJson.tauri.bundle.icon = [
            "icons-mac/32x32.png", "icons-mac/128x128.png",
            "icons-mac/128x128@2x.png", "icons-mac/icon.icns", "icons-mac/icon.ico"
        ];
    }

    console.log('Window Boot url:', configJson.tauri.windows[0].url);
    fs.writeFileSync(tauriLocalConfigPath, JSON.stringify(configJson, null, 4));
}

function buildTauri() {
    console.log(chalk.cyan('\n=== Building Tauri ===\n'));
    setupSrcNode('src-tauri');
    createTauriConfig();
    const debugFlags = isDebug ? '--debug --verbose' : '';
    run(`tauri build --config ./src-tauri/tauri-local.conf.json ${debugFlags}`.trim());
}

function createElectronConfig() {
    console.log(chalk.cyan('\n=== Creating Electron Config ===\n'));
    const electronDir = join(projectRoot, 'src-electron');
    const configPath = join(electronDir, 'config.json');
    const configDevPath = join(electronDir, 'config-dev.json');
    const configEffectivePath = join(electronDir, 'config-effective.json');

    console.log('Merging config.json + config-dev.json -> config-effective.json');
    const baseConfig = JSON.parse(fs.readFileSync(configPath));
    const devConfig = JSON.parse(fs.readFileSync(configDevPath));

    // Merge: config-dev.json overrides config.json
    const effectiveConfig = { ...baseConfig, ...devConfig };

    console.log('phoenixLoadURL:', effectiveConfig.phoenixLoadURL);
    console.log('gaMetricsURL:', effectiveConfig.gaMetricsURL);
    fs.writeFileSync(configEffectivePath, JSON.stringify(effectiveConfig, null, 2));
}

function buildElectron() {
    console.log(chalk.cyan('\n=== Building Electron AppImage ===\n'));
    setupSrcNode('src-electron');
    createElectronConfig();

    const phoenixDir = join(projectRoot, '..', 'phoenix');
    const phoenixDistSrc = join(phoenixDir, 'dist');
    const phoenixDistDest = join(projectRoot, 'src-electron', 'phoenix-dist');

    // Build phoenix production dist
    console.log('Building Phoenix production dist...');
    run('npm run release:prod', { cwd: phoenixDir });

    // Copy dist to electron
    console.log('Copying phoenix dist...');
    run(`shx rm -rf "${phoenixDistDest}"`);
    run(`shx cp -r "${phoenixDistSrc}" "${phoenixDistDest}"`);

    // Build AppImage
    console.log('Building AppImage...');
    run('npm run build:appimage', { cwd: join(projectRoot, 'src-electron') });
}

async function main() {
    if (target === 'tauri') {
        buildTauri();
    } else {
        buildElectron();
    }

    console.log(chalk.green('\n=== Release build complete! ===\n'));
}

main().catch(err => {
    console.error(chalk.red('Build failed:'), err);
    process.exit(1);
});
