import * as fsExtra from "fs-extra";
import fs, {promises as fsPromises} from 'fs';
import * as path from "path";
import * as os from "os";
import {fileURLToPath} from "url";
import {dirname} from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


/**
 * Asynchronously removes a specified directory if it exists.
 *
 * @async
 * @function
 * @param {string} dirPath - The path of the directory to be removed.
 * @returns {Promise<string>} A promise that resolves to a string indicating whether the directory was not found or was successfully removed.
 * @throws {Error} If an error occurs during the operation, it will be logged to the console.
 */
export async function removeDir(dirPath) {
    try {
        const exists = await fsExtra.pathExists(dirPath);

        if (!exists) {
            return 'Directory not found!';
        }

        await fsExtra.remove(dirPath);
        return 'Directory removed!';
    } catch (err) {
        console.error(err);
    }
}

/**
 * Asynchronously lists all folders in a given start path that start with a specific filter.
 *
 * @param {string} startPath - The directory path where the search should start.
 * @param {string} filter - The string filter to match the beginning of the folder names.
 * @returns {Promise<string[]>} - A promise that resolves with an array of folder paths that match the filter.
 * @throws {Error} - Throws an error if there's an issue reading the directory or retrieving the stats of a file.
 *
 * @example
 * // return ['/path/to/folder1', '/path/to/folder2']
 * listFolders('/path/to', 'folder')
 *
 * @example
 * // return ['/path/to/Foo', '/path/to/FooBar']
 * listFolders('/path/to', 'Foo')
 */

export async function listFilesAndFolders(startPath, filter) {
    let files = await fsPromises.readdir(startPath);
    let folders = [];

    for (let file of files) {
        let fullPath = path.join(startPath, file);
        await fsPromises.stat(fullPath);
        if (file.startsWith(filter)) {
            folders.push(fullPath);
        }
    }
    return folders;
}

/**
 * Retrieves platform details including the operating system platform and architecture.
 * @returns {Object} An object containing the platform and architecture details.
 * @example
 * const platformDetails = getPlatformDetails();
 * console.log(platformDetails.platform); // "win" or the actual platform value
 * console.log(platformDetails.arch); // the architecture value
 */
export function getPlatformDetails() {
    const platform = os.platform();
    const arch = os.arch();
    return {
        platform: (platform === "win32") ? "win" : platform,
        arch: arch
    }
}

export function getSideCarBinName(platform, arch) {
    if (platform === "linux" && arch === "x64") {
        return "phnode-x86_64-unknown-linux-gnu";
    }
    if (platform === "darwin" && arch === "x64") {
        return "phnode-x86_64-apple-darwin";
    }
    if (platform ==="darwin" && arch === "arm64"){
        return "phnode-aarch64-apple-darwin";
    }
    if (platform === "win" && arch === "x64") {
        return "phnode-x86_64-pc-windows-msvc.exe";
    }
   throw new Error(`unsupported ${platform} ${arch}`);
}

const METRIC_URL_FOR_STAGE = {
    "dev": "https://dev.phcode.dev/desktop-metrics.html",
    "stage": "https://staging.phcode.dev/desktop-metrics.html",
    "production": "https://phcode.dev/desktop-metrics.html"
};

export function patchTauriConfigWithMetricsHTML(tauriConf) {
    const platform = getPlatformDetails().platform;
    const phoenixConfigPath = (platform === "win") ? `${__dirname}\\...\\..\\phoenix\\dist\\config.json`
        : `${__dirname}/../../phoenix/dist/config.json`;
    console.log("Reading Phoenix config file: ", phoenixConfigPath);
    let phoenixConfigJson = JSON.parse(fs.readFileSync(phoenixConfigPath));
    const phoenixStageInDist = phoenixConfigJson.config.environment;
    console.log("Phoenix stage in dist folder is: ", phoenixStageInDist);
    const metricsURLToUse = METRIC_URL_FOR_STAGE[phoenixStageInDist];
    if(!metricsURLToUse){
        throw new Error("Unknown Phoenix stage(config.environment) in file " + phoenixConfigPath);
    }
    const window = tauriConf.tauri.windows[1];
    if(window.label !== "healthData"){
        throw new Error("Expected tauriConf.json- tauri.windows[1].label to be 'healthData'");
    }
    window.url = metricsURLToUse;
    const metricsPageURL = new URL(metricsURLToUse)
    const dangerousRemoteDomainIpcAccess = tauriConf.tauri.security.dangerousRemoteDomainIpcAccess;
    for(let ipc of dangerousRemoteDomainIpcAccess) {
        if(ipc.windows.includes("healthData")){
            ipc.scheme = "https";
            ipc.domain = metricsPageURL.host;
        }
    }
    console.log("Window Metrics url ", tauriConf.tauri.windows[1].url);
}