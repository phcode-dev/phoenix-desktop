import {fileURLToPath} from "url";
import {dirname} from "path";

import {removeDir, listFolders, getPlatformDetails} from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function cleanNode() {
    console.log('cleaning current node used by phcode from workspace');
    const listOfNodeFolders = await listFolders(__dirname, "node");
    for (let files of listOfNodeFolders) {
        await removeDir(files);
    }
    const platform = getPlatformDetails().platform;
    const tauriDestFolderNode = (platform === "win") ? `${__dirname}\\..\\src-tauri\\node`
        : `${__dirname}/../src-tauri/node`;
    await removeDir(tauriDestFolderNode);
}

await cleanNode();
