import fs from 'fs';
import {dirname} from 'path';
import {fileURLToPath} from "url";
import {getPlatformDetails} from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const getPackageVersion = (packageName) => {
    const details = getPlatformDetails();
    const file = (details.platform === "win") ? `${__dirname}\\..\\package.json` : `${__dirname}/..//package.json`;
    // Read package.json file
    const packageJson = JSON.parse(fs.readFileSync(file, 'utf-8'));

    // Get the specific package version
    return packageJson.version;
};

const version = getPackageVersion('express'); // replace 'express' with your package name
console.log(version);
