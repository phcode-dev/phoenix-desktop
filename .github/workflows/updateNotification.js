import fs from 'fs';
import {
    LATEST_JSON_GITHUB_RELEASE,
    PRODUCT_NAME_SUFFIX_FOR_STAGE,
    UPDATE_NOTIFICATION_LATEST_JSON_FILE_PATH
} from "../../src-build/constants.js";
import {get} from "https";

export function _getTextHTTPS(url) {
    return new Promise((resolve, reject)=>{
        get(url, (resp) => {
            let data = '';
            if(resp.statusCode === 302){
                // http redirect, follow links
                _getTextHTTPS(resp.headers.location)
                    .then(resolve)
                    .catch(reject);
                return;
            }
            // A chunk of data has been received.
            resp.on('data', (chunk) => {
                data += chunk;
            });

            // The whole response has been received.
            resp.on('end', () => {
                resolve(data);
            });

        }).on("error", (err) => {
            reject(err);
        });
    });
}

function _makePrefix(name) {
    return name.trim().split(" ").join(".");
}

// these are the prefix for names of assets in the release created by tauri GitHub action.
// Eg. Phoenix.Code.Experimental.Build_3.2.2_aarch64.dmg, Phoenix.Code.Pre-release_3.2.2_x64-setup.exe, etc..
// note that not all platform bin names follow these convention, so we just check if any of the assets follow the pattern
const DEV_STAGE_PRODUCT_NAME_PREFIX = "Phoenix.Code." + _makePrefix(PRODUCT_NAME_SUFFIX_FOR_STAGE.dev);
const PRE_RELEASE_STAGE_PRODUCT_NAME_PREFIX = "Phoenix.Code." + _makePrefix(PRODUCT_NAME_SUFFIX_FOR_STAGE.stage);
//"": "production" has no suffix

// identify if the release is staging/pre-release/prod, then based on that get the pathname of the update json file
function _identifyUpdateJSONPath(releaseAssets) {
    for(let releaseAsset of releaseAssets) {
        if(releaseAsset.name.startsWith(DEV_STAGE_PRODUCT_NAME_PREFIX)){
            return UPDATE_NOTIFICATION_LATEST_JSON_FILE_PATH.dev;
        }
        else if(releaseAsset.name.startsWith(PRE_RELEASE_STAGE_PRODUCT_NAME_PREFIX)){
            return UPDATE_NOTIFICATION_LATEST_JSON_FILE_PATH.stage;
        }
    }
    return UPDATE_NOTIFICATION_LATEST_JSON_FILE_PATH.production;
}

function isProdStage(releaseAssets) {
    for(let releaseAsset of releaseAssets) {
        if(releaseAsset.name.startsWith(DEV_STAGE_PRODUCT_NAME_PREFIX) ||
            releaseAsset.name.startsWith(PRE_RELEASE_STAGE_PRODUCT_NAME_PREFIX)){
            return false;
        }
    }
    return true;
}

async function _getLatestJson(releaseAssets) {
    for(let releaseAsset of releaseAssets) {
        if(releaseAsset.name === LATEST_JSON_GITHUB_RELEASE){
            // "browser_download_url": "https://github.com/phoenix/phoenix-desktop/releases/download/34/latest.json"
            const downloadURL = releaseAsset.browser_download_url;
            console.log("Latest json download URL is: ", downloadURL);
            const latestJSON = await _getTextHTTPS(downloadURL);
            console.log("Latest json file contents: ", latestJSON);
            return latestJSON;
        }
    }
    throw new Error(`Could not locate ${LATEST_JSON_GITHUB_RELEASE} file in github releases.`);
}

// "Phoenix.Code.Experimental.Build_3.4.2_x64-setup.exe"
const WINDOWS_X64_NAME_SUFFIX = "_x64-setup.exe";
// "Phoenix.Code.Experimental.Build_3.4.2_x64.dmg"
const MAC_INTEL_NAME_SUFFIX = "_x64.dmg";
// "Phoenix.Code.Experimental.Build_3.4.2_aarch64.dmg"
const MAC_M1_NAME_SUFFIX = "_aarch64.dmg";
// "phoenix-code-experimental-build_3.4.2.AppImage"
const LINUX_APPIMAGE_NAME_SUFFIX = ".AppImage";
// "phoenix-code-experimental-build_3.4.2.AppImage.sig"
const LINUX_APPIMAGE_SIG_SUFFIX = ".AppImage.sig";
function _getDownloadURLByNameSuffix(releaseAssets, suffix) {
    for(let releaseAsset of releaseAssets) {
        if(releaseAsset.name.endsWith(suffix)){
            // "browser_download_url":  "https://github.com/phcode-dev/phoenix-desktop/releases/download/dev-app-v3.4.2/Phoenix.Code.Experimental.Build_3.4.2_x64-setup.exe"
            const downloadURL = releaseAsset.browser_download_url;
            console.log("Latest json download URL is: ", downloadURL);
            return downloadURL;
        }
    }
    throw new Error(`Could not locate ${LATEST_JSON_GITHUB_RELEASE} file in github releases.`);
}

function getCurrentVersion(latestJsonPath) {
    try{
        return JSON.parse(fs.readFileSync(latestJsonPath, 'utf8')).version || '0.0.0';
    } catch (e) {
        console.error("Error getting current version from path: ", latestJsonPath, e);
        return '0.0.0';
    }
}

/**
 * Checks if new version is higher or equal than the current version
 * @param currentVersion
 * @param newVersion
 * @return {boolean}
 */
function isHigherOrEqualVersion(currentVersion, newVersion) {
    if(currentVersion === newVersion){
        return true;
    }
    const currentParts = currentVersion.split('.').map(Number);
    const newParts = newVersion.split('.').map(Number);

    for (let i = 0; i < currentParts.length; i++) {
        if (newParts[i] > currentParts[i]) {
            return true; // New version is higher
        } else if (newParts[i] < currentParts[i]) {
            return false; // New version is not higher
        }
        // If they are equal, move to the next part
    }

    // If all parts are equal, the versions are the same, so return false
    return false;
}

export default async function printStuff({github, context, githubWorkspaceRoot}) {
    console.log(github, context, "yo");
    const fullRepoName = context.payload.repository.full_name;
    console.log("repository full name: ", fullRepoName); // Eg: 'phcode-dev/phoenix-desktop'
    const owner = fullRepoName.split("/")[0], repo = fullRepoName.split("/")[1];
    console.log("repository owner, repo: ", owner, repo); // Eg: 'phcode-dev/phoenix-desktop'
    const releaseTag = context.payload.release.tag_name;
    console.log("Release Tag name: ", releaseTag);
    const isPreRelease = context.payload.release.prerelease;
    console.log("Release isPreRelease: ", isPreRelease);
    const releaseNotes = context.payload.release.body;
    console.log("Release Notes: ", releaseNotes);
    const releaseTitle = context.payload.release.name;
    console.log("Release Title: ", releaseTitle);
    const releaseID = context.payload.release.id;
    const releaseAssets = (await github.rest.repos.listReleaseAssets({
        owner,
        repo,
        release_id: releaseID,
    })).data;
    console.log("Release assets: ", releaseAssets);

    // you can call additional github apis using await github.rest.* apis
    // See https://octokit.github.io/rest.js/v19#repos-get-release-by-tag for more availableapis

    // write to the docs folder here. all changes made here to the docs folder will be part of the pull request
    console.log("Updating tauri update JSON file: ", _identifyUpdateJSONPath(releaseAssets));
    const latestJSON = JSON.parse(await _getLatestJson(releaseAssets));
    latestJSON.notes = releaseNotes;

    // Add Linux AppImage to platforms (Electron build with minisign signature)
    try {
        const linuxAppImageURL = _getDownloadURLByNameSuffix(releaseAssets, LINUX_APPIMAGE_NAME_SUFFIX);
        let linuxSignature = "";
        try {
            const sigFileURL = _getDownloadURLByNameSuffix(releaseAssets, LINUX_APPIMAGE_SIG_SUFFIX);
            const sigContent = await _getTextHTTPS(sigFileURL);
            // Base64-encode the signature to match the format of other platforms
            linuxSignature = Buffer.from(sigContent).toString('base64');
            console.log("Linux AppImage signature (base64): ", linuxSignature);
        } catch (sigErr) {
            console.warn("Linux AppImage signature file not found, using empty signature");
        }
        latestJSON.platforms["linux-x86_64"] = {
            "signature": linuxSignature,
            "url": linuxAppImageURL
        };
    } catch (e) {
        console.warn("Linux AppImage not found in release assets, skipping linux-x86_64 platform");
    }

    const latestJsonPath = `${githubWorkspaceRoot}/docs/${_identifyUpdateJSONPath(releaseAssets)}`;
    const currentVersion = getCurrentVersion(latestJsonPath);
    const latestVersion = latestJSON.version;
    if(isHigherOrEqualVersion(currentVersion, latestVersion)){
        console.log("writing latest json to path: ", latestJsonPath, " contents: ",  latestJSON)
        fs.writeFileSync(latestJsonPath, JSON.stringify(latestJSON, null, 4));
    } else {
        console.warn("Current version: ", currentVersion, " is higher than the new release version ", latestVersion, " . Ignoring this release update!");
    }

    // now write the installer.json for phcode.io website download link updates
    if(isProdStage(releaseAssets)){
        const installJsonPath = `${githubWorkspaceRoot}/docs/install.json`;
        const windowsDownloadURL = _getDownloadURLByNameSuffix(releaseAssets, WINDOWS_X64_NAME_SUFFIX);
        const macM1DownloadURL = _getDownloadURLByNameSuffix(releaseAssets, MAC_M1_NAME_SUFFIX);
        const macIntelDownloadURL = _getDownloadURLByNameSuffix(releaseAssets, MAC_INTEL_NAME_SUFFIX);
        let linuxAppImageURL = null;
        try {
            linuxAppImageURL = _getDownloadURLByNameSuffix(releaseAssets, LINUX_APPIMAGE_NAME_SUFFIX);
        } catch (e) {
            console.warn("Linux AppImage not found in release assets, skipping linux_appimage in install.json");
        }
        let installJSON = {
            "phcode.io.DownloadURL": {
                "windows_x64": windowsDownloadURL,
                "mac_m1": macM1DownloadURL,
                "mac_intel": macIntelDownloadURL,
                "chrome_os": "https://play.google.com/store/apps/details?id=prod.phcode.twa"
            }
        };
        if (linuxAppImageURL) {
            installJSON["phcode.io.DownloadURL"]["linux_appimage"] = linuxAppImageURL;
        }
        installJSON = JSON.stringify(installJSON, null, 4);
        console.log("writing install.json to path: ", installJsonPath, " contents: ",  installJSON)
        fs.writeFileSync(installJsonPath, installJSON);
    }
}