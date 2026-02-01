import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import * as os from 'os';
import chalk from 'chalk';
import { getPlatformDetails, patchTauriConfigWithMetricsHTML } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Parse command line args
const args = process.argv.slice(2);
const isBundle = args.includes('--bundle');
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
console.log(chalk.cyan('\n=== Phoenix Code Dist Release Build ===\n'));
console.log(`Platform: ${platform}, Target: ${target}, Bundle: ${isBundle}${isDebug ? ' (debug)' : ''}\n`);
console.log(chalk.gray('To force a different target:'));
console.log(chalk.gray(`  npm run releaseDist -- tauri      # Force Tauri build`));
console.log(chalk.gray(`  npm run releaseDist -- electron   # Force Electron build\n`));

// Warn about non-standard platform/target combinations
const recommendedTarget = (platform === 'linux') ? 'electron' : 'tauri';
if (target !== recommendedTarget) {
    const y = chalk.yellow;
    const b = chalk.bold.yellow;
    const line1 = `  Building ${target} on ${platform} is not officially supported.`;
    const line2 = `  Recommended: npm run releaseDist (auto-detects ${recommendedTarget} for ${platform})`;
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

function createDistConfig() {
    console.log(chalk.cyan('\n=== Creating Tauri Config ===\n'));
    const tauriConfigPath = join(projectRoot, 'src-tauri', 'tauri.conf.json');
    const tauriLocalConfigPath = join(projectRoot, 'src-tauri', 'tauri-local.conf.json');

    console.log('Reading Tauri config file:', tauriConfigPath);
    let configJson = JSON.parse(fs.readFileSync(tauriConfigPath));

    if (isBundle) {
        console.log(chalk.cyan('\n!Updates and signing is disabled while creating msi, appimage and dmg installers. If you want to sign, use tauri build commands directly.\n'));
        configJson.tauri.bundle.active = true;
        configJson.tauri.updater.active = false;
    } else {
        console.log(chalk.cyan('\n!Only creating executables. Creating msi, appimage and dmg installers are disabled in this build. If you want to create an installer, use: npm run releaseDistBundle\n'));
        configJson.tauri.bundle.active = false;
    }

    configJson.build.distDir = '../../phoenix/dist/';

    const phoenixVersion = configJson.package.version;
    if (os.platform() === 'win32') {
        configJson.tauri.windows[0].url = `https://phtauri.localhost/v${phoenixVersion}/`;
        configJson.tauri.windows[2].url = `https://phtauri.localhost/v${phoenixVersion}/drop-files.html`;
    } else {
        configJson.tauri.windows[0].url = `phtauri://localhost/v${phoenixVersion}/`;
        configJson.tauri.windows[2].url = `phtauri://localhost/v${phoenixVersion}/drop-files.html`;
    }

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

    patchTauriConfigWithMetricsHTML(configJson);
    console.log('Window Boot url:', configJson.tauri.windows[0].url);
    console.log('Writing new local config json:', tauriLocalConfigPath);
    fs.writeFileSync(tauriLocalConfigPath, JSON.stringify(configJson, null, 4));
}

function buildTauri() {
    console.log(chalk.cyan('\n=== Building Tauri ===\n'));
    setupSrcNode('src-tauri');
    createDistConfig();
    const debugFlags = isDebug ? '--debug --verbose' : '';
    const verboseFlag = isBundle && !isDebug ? '--verbose' : '';
    run(`tauri build --config ./src-tauri/tauri-local.conf.json ${debugFlags} ${verboseFlag}`.trim().replace(/\s+/g, ' '));
}

function createElectronConfig() {
    console.log(chalk.cyan('\n=== Creating Electron Config ===\n'));
    const electronDir = join(projectRoot, 'src-electron');
    const configPath = join(electronDir, 'config.json');
    const configEffectivePath = join(electronDir, 'config-effective.json');

    // Read ../phoenix/dist/config.json to get environment
    const phoenixDistConfigPath = join(projectRoot, '..', 'phoenix', 'dist', 'config.json');
    console.log('Reading Phoenix dist config:', phoenixDistConfigPath);
    const phoenixDistConfig = JSON.parse(fs.readFileSync(phoenixDistConfigPath));
    const environment = phoenixDistConfig.config.environment; // "dev", "stage", or "production"

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

    // Inject version from src-electron/package.json
    const electronPackagePath = join(electronDir, 'package.json');
    const electronPackage = JSON.parse(fs.readFileSync(electronPackagePath));
    effectiveConfig.version = electronPackage.version;

    console.log('phoenixLoadURL:', effectiveConfig.phoenixLoadURL);
    console.log('gaMetricsURL:', effectiveConfig.gaMetricsURL);
    console.log('version:', effectiveConfig.version);
    fs.writeFileSync(configEffectivePath, JSON.stringify(effectiveConfig, null, 2));
}

function buildElectron() {
    console.log(chalk.cyan('\n=== Building Electron AppImage ===\n'));
    setupSrcNode('src-electron');
    createElectronConfig();

    const phoenixDistSrc = join(projectRoot, '..', 'phoenix', 'dist');
    const phoenixDistDest = join(projectRoot, 'src-electron', 'phoenix-dist');

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
    console.log(chalk.green('\n=== Dist release build complete! ===\n'));
}

main().catch(err => {
    console.error(chalk.red('Build failed:'), err);
    process.exit(1);
});
