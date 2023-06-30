import {fileURLToPath} from "url";
import {dirname} from "path";

import {removeDir, listFilesAndFolders, getPlatformDetails} from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function cleanNode() {
    console.log('cleaning current node used by phcode from workspace');
    const listOfNodeFolders = await listFilesAndFolders(__dirname, "node");
    for (let files of listOfNodeFolders) {
        await removeDir(files);
    }
    const platform = getPlatformDetails().platform;
    const tauriDestFolderNode = (platform === "win") ? `${__dirname}\\..\\src-tauri`
        : `${__dirname}/../src-tauri`;

    const listOfNodeFoldersToDelete = await listFilesAndFolders(tauriDestFolderNode,"node-");
    console.log(listOfNodeFoldersToDelete);
    for (let files of listOfNodeFoldersToDelete) {
        await removeDir(files);
    }

}

await cleanNode();
