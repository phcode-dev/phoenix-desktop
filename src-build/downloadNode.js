import * as https from "https";
import * as fs from "fs";
import tar from "tar";
import * as path from "path";
import AdmZip from 'adm-zip';
import {fileURLToPath} from 'url';
import {dirname} from 'path';
import * as fsExtra from "fs-extra";


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LTS_URL_PREFIX = 'https://nodejs.org/dist/latest-v18.x/';

/**
 Fetches the latest Node.js version by making a request to a specified URL.
 @returns {Promise<string>} A promise that resolves with the latest Node.js version string on success,
 or rejects with an error if the latest version cannot be found.
 */
async function fetchLatestNodeVersion() {
    return new Promise((resolve, reject) => {
        https.get(LTS_URL_PREFIX, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {

                const versionMatch = /node-v(\d+\.\d+\.\d+)/.exec(data);
                if (versionMatch) {
                    resolve(versionMatch[1]);
                } else {
                    reject(new Error('Could not find latest Node.js version'));
                }
            });
        }).on('error', reject);
    });
}

/**
 * Downloads a Node.js binary file from a specified version, platform, and architecture.
 * @param {string} version - The version of Node.js to download (e.g., "14.17.0").
 * @param {string} platform - The platform for which to download the binary (e.g., "win","linux","darwin").
 * @param {string} arch - The architecture for which to download the binary (e.g., "x64","arm64").
 * @returns {Promise<string>} - A Promise that resolves to the downloaded file name if successful.
 * @throws {Error} - If the file fails to download after the maximum number of retries.
 */

async function downloadNodeBinary(version, platform, arch) {
    const extension = (platform === "win") ? "zip" : "tar.gz";
    const fileName = `node-v${version}-${platform}-${arch}.${extension}`;

    const fullPath = `${__dirname}/${fileName}`
    // Check if the file already exists
    if (fs.existsSync(fullPath)) {
        console.log(`File ${fileName} already exists. No need to download.`);
        return fileName;
    }
    const MAX_RETRIES = 3
    console.log(`downloading node ${version} for ${platform} ${arch}`);
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const file = fs.createWriteStream(fullPath);
            await new Promise((resolve, reject) => {
                https.get(`${LTS_URL_PREFIX}node-v${version}-${platform}-${arch}.${extension}`, (res) => {
                    res.pipe(file);
                    res.on('end', () => resolve(fileName));
                    res.on('error', (err) => {
                        fs.unlink(fileName, () => {
                        }); // Remove the file on error
                        reject(err);
                    });
                });
            });
            return fileName; // If the download was successful, return the file name
        } catch (err) {
            console.error(`Download attempt ${attempt + 1} failed.`);
            if (attempt < MAX_RETRIES - 1) {
                console.log(`Retrying download...`);
            }
        }
    }
    throw new Error(`Failed to download file after ${MAX_RETRIES} attempts.`);
}


/**
 * Extracts a tar archive file to the specified output directory.
 * @param {string} inputFile - The path of the tar archive file to be extracted.
 * @param {string} outputDir - The path of the directory where the files will be extracted.
 * @returns {Promise<void>} - A Promise that resolves when the extraction is complete.
 */
async function untarFile(inputFile, outputDir) {
    // Ensure that inputFile and outputDir are absolute paths
    const file = path.resolve(inputFile);
    const outdir = path.resolve(outputDir);

    const MAX_FILES = 10000;
    const MAX_SIZE = 1000000000; // 1 GB

    let fileCount = 0;
    let totalSize = 0;
    try {
        await tar.x({
            file: file,
            cwd: outdir,
            filter: (path, entry) => {
                fileCount++;
                if (fileCount > MAX_FILES) {
                    throw 'Reached max. number of files';
                }

                totalSize += entry.size;
                if (totalSize > MAX_SIZE) {
                    throw 'Reached max. size';
                }

                return true;
            }
        });
        console.log('Extraction complete');
    } catch (err) {
        console.error(err);
    }
}

/**
 Unzips a file at the specified path to the specified extraction path.
 @param {string} zipFilePath - The path to the ZIP file to be extracted.
 @param {string} extractPath - The path where the contents of the ZIP file should be extracted.
 @returns {void}
 */
function unzipFile(zipFilePath, extractPath) {
    try {
        let zip = new AdmZip(zipFilePath);
        zip.extractAllTo(/*target path*/extractPath, /*overwrite*/true);
        console.log(`File has been unzipped to ${extractPath}`);
    } catch (err) {
        console.error(err);
    }
}

/**
 * Copies the latest version of Node.js binary for a specific platform and architecture.
 * @param {string} platform - The platform for which to download the Node.js binary. (e.g., "win", "linux", "mac")
 * @param {string} arch - The architecture for which to download the Node.js binary. (e.g., "x86", "x64")
 * @returns {Promise<void>} - A Promise that resolves when the Node.js binary is copied successfully.
 */
async function copyLatestNodeForBuild(platform, arch) {
    const version = await fetchLatestNodeVersion();
    const fileName = await downloadNodeBinary(version, platform, arch);
    const fullPath = `${__dirname}/${fileName}`
    let nodeFolder = "";

    if (platform === "win") {
        unzipFile(fullPath, ".");
        nodeFolder = fileName.slice(0, -4);
    } else {
        await untarFile(fullPath, ".");
        nodeFolder = fileName.slice(0, -7);
    }
    console.log(nodeFolder);
    const fullPathUnzipFolder = `${__dirname}/${nodeFolder}`;
    const fullPathOfNode = `${__dirname}/node`;
    await removeDir(fullPathOfNode);

    try {
        fs.renameSync(fullPathUnzipFolder, fullPathOfNode);
    } catch (err) {
        console.error('ERROR:', err);
    }
    const tauriDestFolder = `${__dirname}/../src/node`;
    await removeDir(tauriDestFolder)

    await copyDir(fullPathOfNode, tauriDestFolder);

}

/**
 * Copies a directory from the source path to the destination path asynchronously.
 * @param {string} source - The path of the source directory.
 * @param {string} destination - The path of the destination directory.
 * @returns {Promise<void>} - A promise that resolves when the directory is successfully copied, or rejects with an error.
 * @throws {Error} - If an error occurs during the copying process.
 */
async function copyDir(source, destination) {
    try {
        console.log(source);
        console.log(destination);
        await fsExtra.copy(source, destination);
        console.log('Successfully copied the folder!');
    } catch (err) {
        console.error('An error occurred: ', err);
    }
}

/**
 * Asynchronously removes a specified directory if it exists.
 *
 * @async
 * @function
 * @param {string} dirPath - The path of the directory to be removed.
 * @returns {Promise<string>} A promise that resolves to a string indicating whether the directory was not found or was successfully removed.
 * @throws {Error} If an error occurs during the operation, it will be logged to the console.
 */
async function removeDir(dirPath) {
    try {
        const exists = await fsExtra.pathExists(dirPath);

        if (!exists) {
            return 'Directory not found!';
        }

        await fsExtra.remove(dirPath);
        return 'Directory removed!';
    } catch (err) {
        console.error(err);
    }
}

await copyLatestNodeForBuild("linux", "x64");
