import {fileURLToPath} from "url";
import {dirname} from "path";
import fs from 'fs';
import chalk from 'chalk';

import {getPlatformDetails} from "./utils.js";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const METRIC_URL_FOR_STAGE = {
    "dev": "https://dev.phcode.dev/desktop-metrics.html",
    "stage": "https://staging.phcode.dev/desktop-metrics.html",
    "production": "https://phcode.dev/desktop-metrics.html"
};

function _patchTauriConfigWithMetricsHTML(tauriConf, metricsHTMLPageURL) {
    const window = tauriConf.tauri.windows[1];
    if(!window.label === "healthData"){
        throw new Error("Expected tauriConf.json- tauri.windows[1].label to be 'healthData'");
    }
    window.url = metricsHTMLPageURL;
    const metricsPageURL = new URL(metricsHTMLPageURL)
    const dangerousRemoteDomainIpcAccess = tauriConf.tauri.security.dangerousRemoteDomainIpcAccess;
    for(let ipc of dangerousRemoteDomainIpcAccess) {
        if(ipc.windows.includes("healthData")){
            ipc.scheme = "https";
            ipc.domain = metricsPageURL.host;
        }
    }
}

async function createDistReleaseConfig() {
    const platform = getPlatformDetails().platform;
    const tauriConfigPath = (platform === "win") ? `${__dirname}\\..\\src-tauri\\tauri.conf.json`
        : `${__dirname}/../src-tauri/tauri.conf.json`;
    const phoenixConfigPath = (platform === "win") ? `${__dirname}\\...\\..\\phoenix\\dist\\config.json`
        : `${__dirname}/../../phoenix/dist/config.json`;
    const tauriLocalConfigPath = (platform === "win") ? `${__dirname}\\..\\src-tauri\\tauri-local.conf.json`
        : `${__dirname}/../src-tauri/tauri-local.conf.json`;
    console.log("Reading Tauri config file: ", tauriConfigPath);
    let configJson = JSON.parse(fs.readFileSync(tauriConfigPath));
    console.log("Reading Phoenix config file: ", phoenixConfigPath);
    let phoenixConfigJson = JSON.parse(fs.readFileSync(phoenixConfigPath));
    const phoenixStageInDist = phoenixConfigJson.config.environment;
    console.log("Phoenix stage in dist folder is: ", phoenixStageInDist);
    console.log(chalk.cyan("\n!Only creating executables. Creating msi, appimage and dmg installers are disabled in this build. If you want to create an installer, use: npm run tauri build manually after setting distDir in tauri conf!\n"));
    configJson.tauri.bundle.active = false;
    configJson.build.distDir = '../../phoenix/dist/';
    const phoenixVersion = configJson.package.version;
    if(os.platform() === 'win32'){
        configJson.tauri.windows[0].url = `https://phtauri.localhost/v${phoenixVersion}/`;
    } else {
        configJson.tauri.windows[0].url = `phtauri://localhost/v${phoenixVersion}/`;
    }
    const metricsURLToUse = METRIC_URL_FOR_STAGE[phoenixStageInDist];
    if(!metricsURLToUse){
        throw new Error("Unknown Phoenix stage(config.environment) in file " + phoenixConfigPath);
    }
    _patchTauriConfigWithMetricsHTML(configJson, metricsURLToUse);
    console.log("Window Boot url is: ", configJson.tauri.windows[0].url);
    console.log("Writing new local config json ", tauriLocalConfigPath);
    console.log("Window Metrics url ", configJson.tauri.windows[1].url);
    fs.writeFileSync(tauriLocalConfigPath, JSON.stringify(configJson, null, 4));
}

await createDistReleaseConfig();
