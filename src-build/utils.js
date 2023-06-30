import * as fsExtra from "fs-extra";
import {promises as fs} from 'fs';
import * as path from "path";
import * as os from "os";

/**
 * Asynchronously removes a specified directory if it exists.
 *
 * @async
 * @function
 * @param {string} dirPath - The path of the directory to be removed.
 * @returns {Promise<string>} A promise that resolves to a string indicating whether the directory was not found or was successfully removed.
 * @throws {Error} If an error occurs during the operation, it will be logged to the console.
 */
export async function removeDir(dirPath) {
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

/**
 * Asynchronously lists all folders in a given start path that start with a specific filter.
 *
 * @param {string} startPath - The directory path where the search should start.
 * @param {string} filter - The string filter to match the beginning of the folder names.
 * @returns {Promise<string[]>} - A promise that resolves with an array of folder paths that match the filter.
 * @throws {Error} - Throws an error if there's an issue reading the directory or retrieving the stats of a file.
 *
 * @example
 * // return ['/path/to/folder1', '/path/to/folder2']
 * listFolders('/path/to', 'folder')
 *
 * @example
 * // return ['/path/to/Foo', '/path/to/FooBar']
 * listFolders('/path/to', 'Foo')
 */

export async function listFilesAndFolders(startPath, filter) {
    let files = await fs.readdir(startPath);
    let folders = [];

    for (let file of files) {
        let fullPath = path.join(startPath, file);
        await fs.stat(fullPath);
        if (file.startsWith(filter)) {
            folders.push(fullPath);
        }
    }
    return folders;
}

/**
 * Retrieves platform details including the operating system platform and architecture.
 * @returns {Object} An object containing the platform and architecture details.
 * @example
 * const platformDetails = getPlatformDetails();
 * console.log(platformDetails.platform); // "win" or the actual platform value
 * console.log(platformDetails.arch); // the architecture value
 */
export function getPlatformDetails() {
    const platform = os.platform();
    const arch = os.arch();
    return {
        platform: (platform === "win32") ? "win" : platform,
        arch: arch
    }
}

export function getSideCarBinName(platform, arch) {
    if (platform === "linux") {
        return "node-x86_64-unknown-linux-gnu";
    }
    return "node";
}
