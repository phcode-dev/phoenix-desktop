import {fileURLToPath} from "url";
import {dirname} from "path";
import fs from 'fs';
import chalk from 'chalk';

import {getPlatformDetails, patchTauriConfigWithMetricsHTML} from "./utils.js";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function createDistReleaseConfig() {
    const platform = getPlatformDetails().platform;
    const tauriConfigPath = (platform === "win") ? `${__dirname}\\..\\src-tauri\\tauri.conf.json`
        : `${__dirname}/../src-tauri/tauri.conf.json`;
    const tauriLocalConfigPath = (platform === "win") ? `${__dirname}\\..\\src-tauri\\tauri-local.conf.json`
        : `${__dirname}/../src-tauri/tauri-local.conf.json`;
    console.log("Reading Tauri config file: ", tauriConfigPath);
    let configJson = JSON.parse(fs.readFileSync(tauriConfigPath));
    console.log(chalk.cyan("\n!Updates and signing is disabled while creating msi, appimage and dmg installers. If you want to sign, use tauri build commands directly.\n"));
    configJson.tauri.bundle.active = true;
    configJson.tauri.updater.active = false;
    configJson.build.distDir = '../../phoenix/dist/';
    const phoenixVersion = configJson.package.version;
    if(os.platform() === 'win32'){
        configJson.tauri.windows[0].url = `https://phtauri.localhost/v${phoenixVersion}/`;
    } else {
        configJson.tauri.windows[0].url = `phtauri://localhost/v${phoenixVersion}/`;
    }
    if(os.platform() === 'darwin'){
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
    console.log("Window Boot url is: ", configJson.tauri.windows[0].url);
    console.log("Writing new local config json ", tauriLocalConfigPath);
    fs.writeFileSync(tauriLocalConfigPath, JSON.stringify(configJson, null, 4));
}

await createDistReleaseConfig();
