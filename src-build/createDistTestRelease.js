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

// Print build info
console.log(chalk.cyan('\n=== Phoenix Code Dist-Test Release Build ===\n'));
console.log(`Platform: ${platform}, Target: ${target}${isDebug ? ' (debug)' : ''}\n`);
console.log(chalk.gray('To force a different target:'));
console.log(chalk.gray(`  npm run releaseDistTest -- tauri      # Force Tauri build`));
console.log(chalk.gray(`  npm run releaseDistTest -- electron   # Force Electron build\n`));

// Warn about non-standard platform/target combinations
const recommendedTarget = (platform === 'linux') ? 'electron' : 'tauri';
if (target !== recommendedTarget) {
    const y = chalk.yellow;
    const b = chalk.bold.yellow;
    const line1 = `  Building ${target} on ${platform} is not officially supported.`;
    const line2 = `  Recommended: npm run releaseDistTest (auto-detects ${recommendedTarget} for ${platform})`;
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

function createDistTestConfig() {
    console.log(chalk.cyan('\n=== Creating Tauri Config (dist-test) ===\n'));
    const tauriConfigPath = join(projectRoot, 'src-tauri', 'tauri.conf.json');
    const tauriLocalConfigPath = join(projectRoot, 'src-tauri', 'tauri-local.conf.json');

    console.log('Reading Tauri config file:', tauriConfigPath);
    let configJson = JSON.parse(fs.readFileSync(tauriConfigPath));

    // Test-specific settings
    configJson.package.productName = "phoenix-test";
    configJson.tauri.windows[0].title = "phoenix-tester";

    console.log(chalk.cyan('\n!Only creating executables. Creating msi, appimage and dmg installers are disabled in this build. If you want to create an installer, use: npm run tauri build manually after setting distDir in tauri conf!\n'));
    configJson.tauri.bundle.active = false;

    configJson.build.distDir = '../../phoenix/dist-test/';

    const phoenixVersion = configJson.package.version;
    if (os.platform() === 'win32') {
        configJson.tauri.windows[0].url = `https://phtauri.localhost/v${phoenixVersion}/`;
    } else {
        configJson.tauri.windows[0].url = `phtauri://localhost/v${phoenixVersion}/`;
    }

    // For tests we only need the main window. Other windows seem to be breaking tests in github actions.
    configJson.tauri.windows = [configJson.tauri.windows[0]];

    if (os.platform() === 'darwin') {
        // inject macos icons
        configJson.tauri.bundle.icon = [
            "icons-mac/32x32.png",
            "icons-mac/128x128.png",
            "icons-mac/128x128@2x.png",
            "icons-mac/icon.icns",
            "icons-mac/icon.ico"
        ];
    }

    console.log('Window Boot url:', configJson.tauri.windows[0].url);
    console.log('Writing new local config json:', tauriLocalConfigPath);
    fs.writeFileSync(tauriLocalConfigPath, JSON.stringify(configJson, null, 4));
}

function buildTauri() {
    console.log(chalk.cyan('\n=== Building Tauri (dist-test) ===\n'));
    setupSrcNode('src-tauri');
    createDistTestConfig();
    const debugFlags = isDebug ? '--debug --verbose' : '';
    run(`tauri build --config ./src-tauri/tauri-local.conf.json ${debugFlags}`.trim().replace(/\s+/g, ' '));
}

function createElectronConfig() {
    console.log(chalk.cyan('\n=== Creating Electron Config (dist-test) ===\n'));
    const electronDir = join(projectRoot, 'src-electron');
    const configPath = join(electronDir, 'config.json');
    const configEffectivePath = join(electronDir, 'config-effective.json');

    // Read ../phoenix/dist-test/src/config.json to get environment (note: src subfolder for dist-test)
    const phoenixDistTestConfigPath = join(projectRoot, '..', 'phoenix', 'dist-test', 'src', 'config.json');
    console.log('Reading Phoenix dist-test config:', phoenixDistTestConfigPath);
    const phoenixDistTestConfig = JSON.parse(fs.readFileSync(phoenixDistTestConfigPath));
    const environment = phoenixDistTestConfig.config.environment; // "dev", "stage", or "production"

    // Map environment to config file
    const envConfigMap = {
        'dev': 'config-dev.json',
        'stage': 'config-staging.json',
        'production': 'config-prod.json'
    };
    const envConfigFile = envConfigMap[environment] || 'config-dev.json';
    const envConfigPath = join(electronDir, envConfigFile);

    console.log(`Environment: ${environment} -> using ${envConfigFile}`);

    // Merge config.json + env-specific config
    const baseConfig = JSON.parse(fs.readFileSync(configPath));
    const envConfig = JSON.parse(fs.readFileSync(envConfigPath));
    const effectiveConfig = { ...baseConfig, ...envConfig };

    console.log('phoenixLoadURL:', effectiveConfig.phoenixLoadURL);
    console.log('gaMetricsURL:', effectiveConfig.gaMetricsURL);
    fs.writeFileSync(configEffectivePath, JSON.stringify(effectiveConfig, null, 2));
}

function buildElectron() {
    console.log(chalk.cyan('\n=== Building Electron AppImage (dist-test) ===\n'));
    setupSrcNode('src-electron');
    createElectronConfig();

    const phoenixDistTestSrc = join(projectRoot, '..', 'phoenix', 'dist-test');
    const phoenixDistDest = join(projectRoot, 'src-electron', 'phoenix-dist');

    // Copy dist-test to electron
    console.log('Copying phoenix dist-test...');
    run(`shx rm -rf "${phoenixDistDest}"`);
    run(`shx cp -r "${phoenixDistTestSrc}" "${phoenixDistDest}"`);

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
    console.log(chalk.green('\n=== Dist-test release build complete! ===\n'));
}

main().catch(err => {
    console.error(chalk.red('Build failed:'), err);
    process.exit(1);
});
