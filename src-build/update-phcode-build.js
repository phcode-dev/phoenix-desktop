import {$} from 'execa'; // https://www.npmjs.com/package/execa
import fs from 'fs';
import path, {join, dirname} from 'path'
import {fileURLToPath} from "url";
import {EOL} from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// print process.argv
console.log("Updating phoenix to latest, Received the following arguments: ")
process.argv.forEach(function (val, index, array) {
    console.log(index + ': ' + val);
});

const commitHash = process.argv[2];
console.log("Commit hash to update to is: ", commitHash);

async function pwd() {
    const pwd =  process.cwd();
    console.log("current dir: ", pwd);
    return pwd;
}

const projectDir = join(__dirname, '..');
const phoenixProjectPath = path.join(projectDir, "phoenix");

let packageJSONPath = path.join(projectDir, 'package.json');
console.log('loading package.json: ', packageJSONPath);
let packageJSON = JSON.parse(fs.readFileSync(packageJSONPath, 'utf-8'));


const phoenixRepo = packageJSON.phoenixRepo;
console.log(`Cloning`, phoenixRepo);
if(!fs.existsSync(phoenixProjectPath)){
    await $`git clone ${phoenixRepo.gitClonrUrl} --branch ${phoenixRepo.branch}`;
}
process.chdir('phoenix');
await pwd();
console.log('checking out commit: ', commitHash);
await $`git checkout ${commitHash}`;
process.chdir('..');
await pwd();

// update file package.json
const phoenixVersion = JSON.parse(fs.readFileSync("phoenix/package.json")).apiVersion.trim();
console.log("phoenix version and commit detected to update is: ", phoenixVersion, commitHash);
packageJSON.version = phoenixVersion;
packageJSON.phoenixRepo.commit = commitHash;
console.log("Writing updated phoenix-desktop package.json", packageJSONPath);
fs.writeFileSync(packageJSONPath, JSON.stringify(packageJSON, null, 4));


// update file src-tauri/tauri.conf.json
const tauriConfigPath = join(__dirname, '..', 'src-tauri', 'tauri.conf.json');
console.log("Reading tauri config file: ", tauriConfigPath);
let configJson = JSON.parse(fs.readFileSync(tauriConfigPath));
configJson.package.version = phoenixVersion || configJson.package.version;
console.log("Writing updated tauri config file tauri.conf.json", tauriConfigPath);
fs.writeFileSync(tauriConfigPath, JSON.stringify(configJson, null, 4));


// update file src-tauri/cargo.toml
const tauriTOMLPath = join(__dirname, '..', 'src-tauri', 'Cargo.toml');
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