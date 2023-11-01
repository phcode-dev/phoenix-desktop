import {fileURLToPath} from "url";
import {dirname} from "path";
import fs from 'fs';
import * as os from 'os';

import {getPlatformDetails} from "./utils.js";
import chalk from "chalk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function createSrcReleaseConfig() {
    const platform = getPlatformDetails().platform;
    const tauriConfigPath = (platform === "win") ? `${__dirname}\\..\\src-tauri\\tauri.conf.json`
        : `${__dirname}/../src-tauri/tauri.conf.json`;
    const tauriLocalConfigPath = (platform === "win") ? `${__dirname}\\..\\src-tauri\\tauri-local.conf.json`
        : `${__dirname}/../src-tauri/tauri-local.conf.json`;
    console.log("Reading config file: ", tauriConfigPath);
    let configJson = JSON.parse(fs.readFileSync(tauriConfigPath));
    console.log(chalk.cyan("\n!Creating the demo app!\n"));
    configJson.tauri.bundle.resources = []; // no resources packaged in demo app
    console.log("Writing new local config json ", tauriLocalConfigPath);
    fs.writeFileSync(tauriLocalConfigPath, JSON.stringify(configJson, null, 4));
}

await createSrcReleaseConfig();
