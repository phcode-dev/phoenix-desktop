import {$} from 'execa'; // https://www.npmjs.com/package/execa
import fs from 'fs';
import path from 'path'

console.log("Cloning phoenix...");
async function pwd() {
    let output = await $`pwd`;
    const pwd = output.stdout.toString();
    console.log("pwd ", pwd);
    return pwd;
}

const projectDir = await pwd();
const phoenixProjectPath = path.join(projectDir, "phoenix");
console.log("current dir: ", projectDir);

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
console.log('checking out commit: ', phoenixRepo.commit);
await $`git checkout ${phoenixRepo.commit}`;