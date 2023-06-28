import * as https from "https";
import * as fs from "fs";
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
                const versionMatch = data.match(/node-v(\d+\.\d+\.\d+)/);
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
    const MAX_RETRIES = 3;
    const extension = (platform === "win") ? "zip" : "tar.gz";
    const fileName = `node-v${version}-${platform}-${arch}.${extension}`;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const file = fs.createWriteStream(fileName);
            await new Promise((resolve, reject) => {
                https.get(`${LTS_URL_PREFIX}node-v${version}-${platform}-${arch}.${extension}`,
                    (res) => {
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


try {
    const version = await fetchLatestNodeVersion();
    const fileName = await downloadNodeBinary(version, 'linux', 'x64');
    console.log('Downloaded file:', fileName);
} catch (err) {
    console.error(err);
}
