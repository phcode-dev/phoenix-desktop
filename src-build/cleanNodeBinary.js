import {fileURLToPath} from "url";
import {dirname} from "path";

import {removeDir, listFilesAndFolders, getPlatformDetails} from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function cleanNodeBinary() {
    const platform = getPlatformDetails().platform;
    console.log('cleaning current node used by phcode from workspace');

    const tauriBuildScriptsFolderNode = (platform === "win") ? `${__dirname}\\..\\src-build`
        : `${__dirname}/../src-build`;
    const listOfNodeFolders = await listFilesAndFolders(tauriBuildScriptsFolderNode, "node-");
    console.log("remove all node*", listOfNodeFolders);
    for (let files of listOfNodeFolders) {
        await removeDir(files);
    }
    const tauriDestFolderNode = (platform === "win") ? `${__dirname}\\..\\src-tauri`
        : `${__dirname}/../src-tauri`;

    const listOfNodeFoldersToDelete = await listFilesAndFolders(tauriDestFolderNode,"phnode-");
    console.log("removing all src-tauri/phnode-*", listOfNodeFoldersToDelete);
    for (let files of listOfNodeFoldersToDelete) {
        await removeDir(files);
    }

}

await cleanNodeBinary();
