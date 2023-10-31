import * as https from "https";
import * as fs from "fs";
import tar from "tar";
import * as path from "path";
import AdmZip from 'adm-zip';
import {fileURLToPath} from 'url';
import {dirname} from 'path';
import * as fsExtra from "fs-extra";
import {getPlatformDetails, getSideCarBinName, removeDir} from "./utils.js";
import axios from 'axios';
import progress from 'progress-stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Downloads a Node.js binary file from a specified version, platform, and architecture.
 * @param {string} version - The version of Node.js to download (e.g., "14.17.0").
 * @param {string} platform - The platform for which to download the binary (e.g., "win","linux","darwin").
 * @param {string} arch - The architecture for which to download the binary (e.g., "x64","arm64").
 * @returns {Promise<string>} - A Promise that resolves to the downloaded file name if successful.
 * @throws {Error} - If the file fails to download after the maximum number of retries.
 */

async function downloadNodeBinary(platform, arch, maxRetries = 3) {
    try {
        // Step 1: Get the latest release information from phcode-dev/phnode
        const url = 'https://api.github.com/repos/phcode-dev/phnode/releases/latest';
        const releaseResponse = await axios.get(url);

        // Determine file extension based on platform
        const extension = platform === 'win' ? 'zip' : 'tar.gz';

        // Adjusting the regex pattern to match the new file name format
        const regex = new RegExp(`node-v[\\d.]+-${platform}-${arch}\\.${extension}`);
        const asset = releaseResponse.data.assets.find(a => regex.test(a.name));

        if (!asset) {
            throw new Error(`No asset found for platform: ${platform}, arch: ${arch}`);
        }

        // Step 2: Check if file already exists
        const outputPath = path.resolve(__dirname, asset.name);
        if (fs.existsSync(outputPath)) {
            console.log('File already downloaded:', asset.name);
            return asset.name;
        }

        // Step 3: Download the asset with progress
        const writer = fs.createWriteStream(outputPath);
        const { data, headers } = await axios({
            url: asset.browser_download_url,
            method: 'GET',
            responseType: 'stream',
            timeout: 10000 // timeout in 10 seconds
        });

        const str = progress({
            length: headers['content-length'],
            time: 100 /* ms */
        });

        str.on('progress', progress => {
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            process.stdout.write(`Downloading... ${Math.round(progress.percentage)}%`);
        });

        data.pipe(str).pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                console.log('\nDownload completed:', asset.name);
                resolve(asset.name);
            });
            writer.on('error', err => {
                fs.unlinkSync(outputPath); // remove the partially downloaded file
                reject(err);
            });
        });

    } catch (err) {
        console.error('Error:', err.message);
        if (maxRetries > 0) {
            console.log('Retrying download...');
            return downloadNodeBinary(platform, arch, maxRetries - 1);
        } else {
            throw new Error('Max retries reached, download failed.');
        }
    }
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
                    throw new Error('Reached max. number of files');
                }
                totalSize += entry.size;
                if (totalSize > MAX_SIZE) {
                    throw new Error('Reached max. size');
                }
                return true;
            }
        });
        console.log('Extraction complete');
    } catch (err) {
        throw new Error(err);
    }
}

/**
 Unzips a file at the specified path to the specified extraction path.
 @param {string} zipFilePath - The path to the ZIP file to be extracted.
 @param {string} extractPath - The path where the contents of the ZIP file should be extracted.
 @returns {void}
 */
function unzipFile(zipFilePath, extractPath) {
    const MAX_FILES = 10000;
    const MAX_SIZE = 1000000000; // 1 GB
    const THRESHOLD_RATIO = 50;

    let fileCount = 0;
    let totalSize = 0;
    let zip = new AdmZip(zipFilePath);
    let zipEntries = zip.getEntries();
    zipEntries.forEach(function (zipEntry) {
        fileCount++;
        if (fileCount > MAX_FILES) {
            throw new Error('Reached max. number of files');
        }

        let entrySize = zipEntry.getData().length;
        totalSize += entrySize;
        if (totalSize > MAX_SIZE) {
            throw new Error('Reached max. size');
        }

        let compressionRatio = entrySize / zipEntry.header.compressedSize;
        if (compressionRatio > THRESHOLD_RATIO) {
            throw new Error('Reached max. compression ratio');
        }

        if (!zipEntry.isDirectory) {
            zip.extractEntryTo(zipEntry.entryName, extractPath);
        }
    });

}

/**
 * Copies the latest version of Node.js binary for a specific platform and architecture.
 * @param {string} platform - The platform for which to download the Node.js binary. (e.g., "win", "linux", "mac")
 * @param {string} arch - The architecture for which to download the Node.js binary. (e.g., "x86", "x64")
 * @returns {Promise<void>} - A Promise that resolves when the Node.js binary is copied successfully.
 */
async function copyLatestNodeForBuild(platform, arch) {
    const fileName = await downloadNodeBinary(platform, arch);
    const fullPath = (platform === "win") ? `${__dirname}\\${fileName}` : `${__dirname}/${fileName}`;
    let nodeFolder = "";

    try {
        if (platform === "win") {
            unzipFile(fullPath, __dirname);
            nodeFolder = fileName.slice(0, -4);
        } else {
            await untarFile(fullPath, __dirname);
            nodeFolder = fileName.slice(0, -7);
        }
    } catch (e) {
        console.error(e);
        process.exit(1);
    }

    console.log(nodeFolder);
    const fullPathUnzipFolder = (platform === "win") ? `${__dirname}\\${nodeFolder}` : `${__dirname}/${nodeFolder}`;
    const fullPathOfNode = (platform === "win") ? `${__dirname}\\node` : `${__dirname}/node`;
    await removeDir(fullPathOfNode);

    try {
        fs.renameSync(fullPathUnzipFolder, fullPathOfNode);
    } catch (err) {
        console.error('ERROR:', err);
    }

    const srcNode = (platform === "win") ? `${fullPathOfNode}\\node.exe` : `${fullPathOfNode}/bin/node`;
    const destFileName = getSideCarBinName(platform, arch);
    const tauriDestNode = (platform === "win") ? `${__dirname}\\..\\src-tauri\\${destFileName}` : `${__dirname}/../src-tauri/${destFileName}`;

    try {
        fs.copyFileSync(srcNode, tauriDestNode);
        console.log("File copied successfully!");
    } catch (err) {
        console.log("Error Found:", err);
        throw new Error(err);
    }
    await removeDir(fullPathOfNode);
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

let args = process.argv.slice(2);
console.log(args);
const platformDetails = (args.length === 1) ? JSON.parse(args[0]) : getPlatformDetails();
console.log(platformDetails);

await copyLatestNodeForBuild(platformDetails.platform, platformDetails.arch);
