const { app, BrowserWindow, protocol, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const { registerAppIpcHandlers, terminateAllProcesses } = require('./main-app-ipc');
const { registerFsIpcHandlers, getAppDataDir } = require('./main-fs-ipc');
const { registerCredIpcHandlers, cleanupWindowTrust } = require('./main-cred-ipc');
const { registerWindowIpcHandlers, registerWindow } = require('./main-window-ipc');

// Request single instance lock - only one instance of the app should run at a time
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    // Another instance is running, quit this one immediately
    app.quit();
}

// In-memory key-value store shared across all windows (mirrors Tauri's put_item/get_all_items)
// Used for multi-window storage synchronization
const sharedStorageMap = new Map();

let mainWindow;

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        icon: path.join(__dirname, '..', 'src-tauri', 'icons', 'icon.png')
    });

    // Register main window with label 'main' (mirrors Tauri's window labeling)
    registerWindow(mainWindow, 'main');

    // Load the test page from the http-server
    mainWindow.loadURL('http://localhost:8000/src/');

    mainWindow.webContents.on('destroyed', () => {
        cleanupWindowTrust(mainWindow.webContents.id);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

async function gracefulShutdown(exitCode = 0) {
    console.log('Initiating graceful shutdown...');
    await terminateAllProcesses();
    app.exit(exitCode);
}

// Register all IPC handlers
registerAppIpcHandlers();
registerFsIpcHandlers();
registerCredIpcHandlers();
registerWindowIpcHandlers();

/**
 * IPC handlers for electronAPI
 * Preload location: contextBridge.exposeInMainWorld('electronAPI', { ... })
 */

// Set zoom factor on the webview (mirrors Tauri's zoom_window)
ipcMain.handle('zoom-window', (event, scaleFactor) => {
    event.sender.setZoomFactor(scaleFactor);
});

// In-memory storage for multi-window sync (mirrors Tauri's put_item/get_all_items)
ipcMain.handle('put-item', (event, key, value) => {
    sharedStorageMap.set(key, value);
});

ipcMain.handle('get-all-items', () => {
    return Object.fromEntries(sharedStorageMap);
});

// Toggle DevTools
ipcMain.handle('toggle-dev-tools', (event) => {
    event.sender.toggleDevTools();
});

// Get path to phnode binary
ipcMain.handle('get-phnode-path', () => {
    const phNodePath = path.resolve(__dirname, 'bin', 'phnode');
    if (!fs.existsSync(phNodePath)) {
        throw new Error(`phnode binary does not exist: ${phNodePath}`);
    }
    return phNodePath;
});

// Get path to src-node (for development)
ipcMain.handle('get-src-node-path', () => {
    const srcNodePath = path.resolve(__dirname, '..', '..', 'phoenix', 'src-node');
    if (!fs.existsSync(srcNodePath)) {
        throw new Error(`src-node path does not exist: ${srcNodePath}`);
    }
    return srcNodePath;
});

// Handle quit request from renderer
app.on('quit-requested', (exitCode) => {
    gracefulShutdown(exitCode);
});

// Handle second instance attempts - forward args to existing windows
app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Forward to all windows via IPC
    // Window focusing is handled by the renderer's singleInstanceHandler
    BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
            win.webContents.send('single-instance', {
                args: commandLine,
                cwd: workingDirectory
            });
        }
    });
});

app.whenReady().then(async () => {
    // Remove default menu bar
    Menu.setApplicationMenu(null);

    // Register asset:// protocol for serving local files from appLocalData/assets/
    const appDataDir = getAppDataDir();
    const assetsDir = path.join(appDataDir, 'assets');

    protocol.registerFileProtocol('asset', (request, callback) => {
        try {
            const url = new URL(request.url);
            // Decode the path from URL encoding
            const requestedPath = decodeURIComponent(url.pathname.substring(1)); // Remove leading /
            const normalizedRequested = path.normalize(requestedPath);
            const normalizedAssetsDir = path.normalize(assetsDir);

            // Security: Ensure path is under assets directory (prevent directory traversal)
            if (!normalizedRequested.startsWith(normalizedAssetsDir)) {
                console.error('Asset access denied - path not under assets dir:', requestedPath);
                callback({ error: -10 }); // net::ERR_ACCESS_DENIED
                return;
            }

            callback({ path: normalizedRequested });
        } catch (err) {
            console.error('Asset protocol error:', err);
            callback({ error: -2 }); // net::ERR_FAILED
        }
    });

    await createWindow();
});

app.on('window-all-closed', () => {
    gracefulShutdown(0);
});

// macOS: When dock icon is clicked and no windows are open, create a new window.
// Currently this won't fire because window-all-closed quits the app. If macOS support
// is added and we want apps to stay running with no windows, change window-all-closed
// to not quit on macOS (process.platform !== 'darwin').
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Handle process termination signals
process.on('SIGINT', () => gracefulShutdown(0));
process.on('SIGTERM', () => gracefulShutdown(0));
