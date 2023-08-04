import {fileURLToPath} from "url";
import {dirname, join} from "path";
import {
    PRODUCT_NAME_SUFFIX_FOR_STAGE,
    BUNDLE_IDENTIFIER_FOR_STAGE,
    UPDATE_NOTIFICATION_LATEST_JSON_FILE_PATH,
    UPDATE_NOTIFICATIONS_BASE_URL
} from "./constants.js";
import { EOL } from "os";
import fs from 'fs';

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
    // return `Phoenix code Pre-release` or `Phoenix code Experimental Build`
    return `${name} ${PRODUCT_NAME_SUFFIX_FOR_STAGE[stage]}`;
}

async function ciCreateDistReleaseConfig() {
    const phoenixConfigPath = join(__dirname, '..', 'phoenix', 'dist', 'config.json');
    const packageJSONPath = join(__dirname, '..', 'package.json');
    const tauriTOMLPath = join(__dirname, '..', 'src-tauri', 'Cargo.toml');
    const tauriConfigPath = join(__dirname, '..', 'src-tauri', 'tauri.conf.json');
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
    configJson.build.distDir = '../phoenix/dist/'
    // delete configJson.tauri.updater; // #uncomment_line_for_local_build_1
    // delete configJson.tauri.bundle.windows.certificateThumbprint // #uncomment_line_for_local_build_1
    configJson.package.version = phoenixVersion;
    configJson.package.productName = _getProductName(configJson.package.productName, phoenixStage);
    console.log("Product name is: ", configJson.package.productName);
    configJson.tauri.windows[0].title = configJson.package.productName;
    configJson.tauri.updater.endpoints = [
        `${UPDATE_NOTIFICATIONS_BASE_URL}${UPDATE_NOTIFICATION_LATEST_JSON_FILE_PATH[phoenixStage]}`
    ];
    const bundleIdentifier = BUNDLE_IDENTIFIER_FOR_STAGE[phoenixStage] || "io.phcode.unknown.stage";
    console.log("Product Bundle Identifier is: ", bundleIdentifier);
    configJson.tauri.bundle.identifier = bundleIdentifier;
    console.log("Product update endpoints are: ", configJson.tauri.updater.endpoints);
    console.log("Writing new dist config json ", tauriConfigPath);
    fs.writeFileSync(tauriConfigPath, JSON.stringify(configJson, null, 4));
    return phoenixVersion;
}

await ciCreateDistReleaseConfig();
