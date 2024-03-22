import {dirname, join} from "path";
import fs from "fs";
import {fileURLToPath} from "url";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
async function ciCreateDistReleaseConfig() {
    const tauriConfigPath = join(__dirname, '..', 'src-tauri', 'tauri.conf.json');

    console.log("remove bundle config in tauri.conf.json", tauriConfigPath);
    const configJson = JSON.parse(fs.readFileSync(tauriConfigPath));
    configJson.tauri.bundle.active = false;
    configJson.tauri.updater.active = false;
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
    console.log("Product name is: ", configJson.package.productName);
    fs.writeFileSync(tauriConfigPath, JSON.stringify(configJson, null, 4));
}

await ciCreateDistReleaseConfig();
