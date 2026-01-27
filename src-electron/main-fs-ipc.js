const { ipcMain, dialog, BrowserWindow } = require('electron');
const path = require('path');
const fsp = require('fs/promises');
const os = require('os');
const { identifier: APP_IDENTIFIER } = require('./package.json');

// Electron IPC only preserves Error.message when errors cross the IPC boundary (see
// https://github.com/electron/electron/issues/24427). To preserve error.code for FS
// operations, we catch errors and return them as plain objects {error: {code, message}}.
// The preload layer unwraps these back into proper Error objects.
function fsResult(promise) {
    return promise.catch(err => {
        return { __fsError: true, code: err.code, message: err.message };
    });
}

/**
 * Returns the app's local data directory path with trailing separator.
 * Matches Tauri's appLocalDataDir which uses the bundle identifier.
 * - Linux: ~/.local/share/{APP_IDENTIFIER}/
 * - macOS: ~/Library/Application Support/{APP_IDENTIFIER}/
 * - Windows: %LOCALAPPDATA%/{APP_IDENTIFIER}/
 */
function getAppDataDir() {
    const home = os.homedir();
    let appDataDir;
    switch (process.platform) {
        case 'darwin':
            appDataDir = path.join(home, 'Library', 'Application Support', APP_IDENTIFIER);
            break;
        case 'win32':
            appDataDir = path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), APP_IDENTIFIER);
            break;
        default:
            appDataDir = path.join(process.env.XDG_DATA_HOME || path.join(home, '.local', 'share'), APP_IDENTIFIER);
    }
    return appDataDir + path.sep;
}

function registerFsIpcHandlers() {
    // Directory APIs
    ipcMain.handle('get-documents-dir', () => {
        // Match Tauri's documentDir which ends with a trailing slash
        return path.join(os.homedir(), 'Documents') + path.sep;
    });

    ipcMain.handle('get-home-dir', () => {
        // Match Tauri's homeDir which ends with a trailing slash
        const home = os.homedir();
        return home.endsWith(path.sep) ? home : home + path.sep;
    });

    ipcMain.handle('get-temp-dir', () => {
        return os.tmpdir();
    });

    ipcMain.handle('get-app-data-dir', () => getAppDataDir());

    // Get Windows drive letters (returns null on non-Windows platforms)
    ipcMain.handle('get-windows-drives', async () => {
        if (process.platform !== 'win32') {
            return null;
        }
        // On Windows, check which drive letters exist by testing A-Z
        const drives = [];
        for (let i = 65; i <= 90; i++) { // A-Z
            const letter = String.fromCharCode(i);
            const drivePath = `${letter}:\\`;
            try {
                await fsp.access(drivePath);
                drives.push(letter);
            } catch {
                // Drive doesn't exist
            }
        }
        return drives.length > 0 ? drives : null;
    });

    // Dialogs
    ipcMain.handle('show-open-dialog', async (event, options) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        const result = await dialog.showOpenDialog(win, options);
        return result.filePaths;
    });

    ipcMain.handle('show-save-dialog', async (event, options) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        const result = await dialog.showSaveDialog(win, options);
        return result.filePath;
    });

    // FS operations
    ipcMain.handle('fs-readdir', async (event, dirPath) => {
        return fsResult(
            fsp.readdir(dirPath, { withFileTypes: true })
                .then(entries => entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() })))
        );
    });

    ipcMain.handle('fs-stat', async (event, filePath) => {
        return fsResult(
            fsp.stat(filePath).then(stats => ({
                isFile: stats.isFile(),
                isDirectory: stats.isDirectory(),
                isSymbolicLink: stats.isSymbolicLink(),
                size: stats.size,
                mode: stats.mode,
                ctimeMs: stats.ctimeMs,
                atimeMs: stats.atimeMs,
                mtimeMs: stats.mtimeMs,
                nlink: stats.nlink,
                dev: stats.dev
            }))
        );
    });

    ipcMain.handle('fs-mkdir', (event, dirPath, options) => fsResult(fsp.mkdir(dirPath, options)));
    ipcMain.handle('fs-unlink', (event, filePath) => fsResult(fsp.unlink(filePath)));
    ipcMain.handle('fs-rmdir', (event, dirPath, options) => fsResult(fsp.rm(dirPath, options)));
    ipcMain.handle('fs-rename', (event, oldPath, newPath) => fsResult(fsp.rename(oldPath, newPath)));
    ipcMain.handle('fs-read-file', (event, filePath) => fsResult(fsp.readFile(filePath)));
    ipcMain.handle('fs-write-file', (event, filePath, data) => fsResult(fsp.writeFile(filePath, Buffer.from(data))));
}

module.exports = {
    registerFsIpcHandlers,
    getAppDataDir
};
