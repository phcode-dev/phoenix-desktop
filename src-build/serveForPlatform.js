import {getPlatformDetails} from "./utils.js";
import {execa} from "execa";

const {platform} = getPlatformDetails();

// Linux uses Electron, Windows/Mac use Tauri
const serveScript = (platform === "linux") ? "_serveElectron" : "_serveTauri";

console.log(`Platform: ${platform}, running: npm run ${serveScript}`);

await execa("npm", ["run", serveScript], {stdio: "inherit"});
