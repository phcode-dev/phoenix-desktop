import {fileURLToPath} from "url";
import {dirname, join} from "path";
import {
    PRODUCT_NAME_SUFFIX_FOR_STAGE,
    BUNDLE_IDENTIFIER_FOR_STAGE,
    UPDATE_NOTIFICATION_LATEST_JSON_FILE_PATH,
    UPDATE_NOTIFICATIONS_BASE_URL
} from "./constants.js";
import { EOL } from "os";
import os from "os";
import fs from 'fs';
import {patchTauriConfigWithMetricsHTML} from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// if the name is already of the form `Phoenix code Pre-release`, just return `Phoenix Code`
function _removeSuffixesFromName(name) {
    name = name.trim();
    const knownSuffixes = Object.values(PRODUCT_NAME_SUFFIX_FOR_STAGE)
    for(let suffix of knownSuffixes){
        if(suffix && name.endsWith(suffix)){
            name = name.substring(0, name.length - suffix.length)
        }
    }
    return name.trim();
}

function _getProductName(name, stage) {
    name = _removeSuffixesFromName(name);
    if(stage === 'production') {
        return name; // Phoenix Code
    }
    if(!PRODUCT_NAME_SUFFIX_FOR_STAGE[stage]) {
        throw new Error(`Cannot build Phoenix for unknown environment ${stage}`);
    }
    // return `Phoenix code Pre-release` or `Phoenix code Experimental Build` or `Phoenix code <beta>`
    return `${name} ${PRODUCT_NAME_SUFFIX_FOR_STAGE[stage]}`.trim();
}

function replaceBundleIdentifierString(sourceStr, newIdentifier) {
    const IDENTIFIER_PLACEHOLDER = "TAURI_BUNDLE_IDENTIFIER_PLACE_HOLDER";
    let bundleIdentifiers = Object.values(BUNDLE_IDENTIFIER_FOR_STAGE);
    // longest prefix first, else may cause substring replacement only
    bundleIdentifiers.sort((a, b) => b.length - a.length);
    for(const identifier of bundleIdentifiers){
        sourceStr = sourceStr.replace(identifier, IDENTIFIER_PLACEHOLDER);
    }
    return sourceStr.replace(IDENTIFIER_PLACEHOLDER, newIdentifier);
}

async function ciCreateDistReleaseConfig() {
    const phoenixConfigPath = join(__dirname, '..', 'phoenix', 'dist', 'config.json');
    const packageJSONPath = join(__dirname, '..', 'package.json');
    const tauriTOMLPath = join(__dirname, '..', 'src-tauri', 'Cargo.toml');
    const tauriConfigPath = join(__dirname, '..', 'src-tauri', 'tauri.conf.json');
    const infoPLISTPath = join(__dirname, '..', 'src-tauri', 'Info.plist');
    const mainRustPath = join(__dirname, '..', 'src-tauri', "src", 'main.rs');
    console.log("loading phoenix config: ", phoenixConfigPath);

    let configJson = JSON.parse(fs.readFileSync(phoenixConfigPath));
    const phoenixVersion = configJson.version.split("-")[0];
    const phoenixStage = configJson.config.environment;
    console.log("phoenix version detected is: ", phoenixVersion); // "version": "3.2.2-19332"
    console.log("phoenix stage is: ", phoenixStage);
    console.log("write version in package.json", packageJSONPath);
    let packageJson = JSON.parse(fs.readFileSync(packageJSONPath));
    packageJson.version = phoenixVersion;
    fs.writeFileSync(packageJSONPath, JSON.stringify(packageJson, null, 4));

    console.log("write version in cargo.toml", tauriTOMLPath);
    const toml = fs.readFileSync(tauriTOMLPath).toString();
    const lines = toml.split(/\r?\n/);
    for(let i=0;i<lines.length;i++){
        if(lines[i].trim().startsWith("version =")){
            lines[i] = `version = "${phoenixVersion}"`;
        }
    }
    const patchedTOML = lines.join(EOL);
    fs.writeFileSync(tauriTOMLPath, patchedTOML);

    console.log("write version in tauri.conf.json", tauriConfigPath);
    configJson = JSON.parse(fs.readFileSync(tauriConfigPath));
    configJson.build.distDir = '../phoenix/dist/';
    // configJson.tauri.bundle.active = false; // #uncomment_line_for_local_build_1
    configJson.package.version = phoenixVersion;
    configJson.package.productName = _getProductName(configJson.package.productName, phoenixStage);
    configJson.tauri.bundle.shortDescription = configJson.package.productName;
    console.log("Product name is: ", configJson.package.productName);
    configJson.tauri.windows[0].title = configJson.package.productName;
    if(os.platform() === 'win32'){
        configJson.tauri.windows[0].url = `https://phtauri.localhost/v${phoenixVersion}/`;
        configJson.tauri.windows[2].url = `https://phtauri.localhost/v${phoenixVersion}/drop-files.html`;
    } else {
        configJson.tauri.windows[0].url = `phtauri://localhost/v${phoenixVersion}/`;
        configJson.tauri.windows[2].url = `phtauri://localhost/v${phoenixVersion}/drop-files.html`;
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
    console.log("Window Boot url is: ", configJson.tauri.windows[0].url);
    configJson.tauri.updater.endpoints = [
        `${UPDATE_NOTIFICATIONS_BASE_URL}${UPDATE_NOTIFICATION_LATEST_JSON_FILE_PATH[phoenixStage]}`
    ];
    const bundleIdentifier = BUNDLE_IDENTIFIER_FOR_STAGE[phoenixStage] || "io.phcode.unknown.stage";
    console.log("Product Bundle Identifier is: ", bundleIdentifier);
    configJson.tauri.bundle.identifier = bundleIdentifier;

    patchTauriConfigWithMetricsHTML(configJson, true);

    console.log("Product update endpoints are: ", configJson.tauri.updater.endpoints);
    console.log("Writing new dist config json ", tauriConfigPath, configJson);
    fs.writeFileSync(tauriConfigPath, JSON.stringify(configJson, null, 4));

    // patch info.plist for mac
    console.log("Writing new dist info plist", infoPLISTPath);
    let infoPlist = fs.readFileSync(infoPLISTPath, "utf8");
    fs.writeFileSync(infoPLISTPath, replaceBundleIdentifierString(infoPlist, bundleIdentifier), "utf8");

    // patch main.rs for mac
    console.log("Writing new dist main.ts", mainRustPath);
    let mainRustFileContent = fs.readFileSync(mainRustPath, "utf8");
    fs.writeFileSync(mainRustPath, replaceBundleIdentifierString(mainRustFileContent, bundleIdentifier), "utf8");

    return phoenixVersion;
}

await ciCreateDistReleaseConfig();
