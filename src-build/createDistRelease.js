import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import os from 'os';
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

// Print build info
console.log(chalk.cyan('\n=== Phoenix Code Dist Release Build ===\n'));
console.log(`Platform: ${platform}, Bundle: ${isBundle}, Debug: ${isDebug}\n`);

function run(cmd, options = {}) {
    console.log(chalk.blue(`> ${cmd}`));
    execSync(cmd, { stdio: 'inherit', ...options });
}

function setupSrcNode() {
    console.log(chalk.cyan('\n=== Setting up src-node ===\n'));
    const srcNodeSource = join(projectRoot, '..', 'phoenix', 'src-node');
    const destPath = join(projectRoot, 'src-tauri', 'src-node');

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
    const debugFlags = isDebug ? '--debug --verbose' : '';
    const verboseFlag = isBundle && !isDebug ? '--verbose' : '';
    run(`tauri build --config ./src-tauri/tauri-local.conf.json ${debugFlags} ${verboseFlag}`.trim().replace(/\s+/g, ' '));
}

async function main() {
    setupSrcNode();
    createDistConfig();
    buildTauri();
    console.log(chalk.green('\n=== Dist release build complete! ===\n'));
}

main().catch(err => {
    console.error(chalk.red('Build failed:'), err);
    process.exit(1);
});
