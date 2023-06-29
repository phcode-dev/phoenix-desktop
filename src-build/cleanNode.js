import {fileURLToPath} from "url";
import {dirname} from "path";

import {removeDir, listFolders, getPlatformDetails} from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function cleanNode() {
    const listOfNodeFolders = await listFolders(__dirname, "node");
    for (let files of listOfNodeFolders) {
        await removeDir(files);
    }
    const platform = getPlatformDetails().platform;
    const tauriDestFolderNode = (platform === "win") ? `${__dirname}\\..\\src-tauri\\node`(args.length === 1)
        : `${__dirname}/../src-tauri/node`;
    await removeDir(tauriDestFolderNode)
    console.log(listOfNodeFolders);
}

await cleanNode();
