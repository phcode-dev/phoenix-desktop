import {fileURLToPath} from "url";
import {dirname, join} from "path";
import { EOL } from "os";
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function patchVersionNumbers() {
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
    configJson.package.version = phoenixVersion;
    fs.writeFileSync(tauriConfigPath, JSON.stringify(configJson, null, 4));
    return phoenixVersion;
}

async function ciCreateDistReleaseConfig() {
    const tauriConfigPath = join(__dirname, '..', 'src-tauri', 'tauri.conf.json');
    console.log("Reading config file: ", tauriConfigPath);
    let configJson = JSON.parse(fs.readFileSync(tauriConfigPath));
    configJson.package.version = await patchVersionNumbers() || "3.0.0";
    // delete configJson.tauri.updater; // #uncomment_line_for_local_build_1
    configJson.build.distDir = '../phoenix/dist/'
    console.log("Writing new dist config json ", tauriConfigPath);
    fs.writeFileSync(tauriConfigPath, JSON.stringify(configJson, null, 4));
}

await ciCreateDistReleaseConfig();
