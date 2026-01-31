const { app, BrowserWindow, protocol, Menu, ipcMain, net } = require('electron');
const path = require('path');
const fs = require('fs');

// Suppress Electron's noisy "Failed to load URL" stderr messages for subframe load failures
const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk, encoding, callback) => {
    const str = typeof chunk === 'string' ? chunk : chunk.toString();
    if (str.includes('electron: Failed to load URL:')) {
        return true; // Suppress this message
    }
    return originalStderrWrite(chunk, encoding, callback);
};

const { registerAppIpcHandlers, terminateAllProcesses, filterCliArgs } = require('./main-app-ipc');
const { registerFsIpcHandlers, getAppDataDir } = require('./main-fs-ipc');
const { registerCredIpcHandlers } = require('./main-cred-ipc');
const { registerWindowIpcHandlers, registerWindow, setOnAllWindowsClosed } = require('./main-window-ipc');
const { assertTrusted } = require('./ipc-security');
const { getWindowOptions, trackWindowState, DEFAULTS } = require('./window-state');
const { phoenixLoadURL, gaMetricsURL, version, productName } = require('./config');

// Handle --version / -v flag before any Electron initialization
if (process.argv.includes('-v') || process.argv.includes('--version')) {
    console.log(`${version}`);
    process.exit(0);
}

// Register custom schemes as privileged (must be done before app ready)
// This enables standard web features: fetch, localStorage, cookies, etc.
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'phtauri',
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
            stream: true
        }
    },
    {
        // asset:// is for serving static files only - minimal privileges to match Tauri's security posture
        // No standard/secure/corsEnabled - just enough for fetch() to read local assets
        scheme: 'asset',
        privileges: {
            supportFetchAPI: true,
            stream: true
        }
    }
]);

// Request single instance lock - only one instance of the app should run at a time
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    // Another instance is running, quit this one immediately
    app.quit();
    // Return value is ignored but this stops further module execution
    return;
}

function getPhNodePath() {
    if (!app.isPackaged) {
        return path.resolve(__dirname, 'bin', 'phnode');
    }
    // extraResources places files directly in resources/
    return path.join(process.resourcesPath, 'bin', 'phnode');
}

function getSrcNodePath() {
    if (!app.isPackaged) {
        // Dev: use phoenix repo's src-node
        return path.resolve(__dirname, '..', '..', 'phoenix', 'src-node');
    }
    // extraResources places files directly in resources/
    return path.join(process.resourcesPath, 'src-node');
}

// In-memory key-value store shared across all windows (mirrors Tauri's put_item/get_all_items)
// Used for multi-window storage synchronization
const sharedStorageMap = new Map();

// Hidden metrics window for Google Analytics
let metricsWindow = null;

async function createMetricsWindow() {
    metricsWindow = new BrowserWindow({
        show: false,
        width: 400,
        height: 300,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    metricsWindow.loadURL(gaMetricsURL);
    // uncomment line below if you want to open dev tools at app start
    // metricsWindow.webContents.openDevTools();
}

async function createWindow() {
    // Get window options with restored state or defaults
    const windowOptions = getWindowOptions();
    const wasMaximized = windowOptions._wasMaximized;
    delete windowOptions._wasMaximized;

    const win = new BrowserWindow({
        ...windowOptions,
        minWidth: DEFAULTS.minWidth,
        minHeight: DEFAULTS.minHeight,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        icon: path.join(__dirname, '..', 'src-tauri', 'icons', 'icon.png')
    });

    // Track window state for persistence
    trackWindowState(win);

    // Restore maximized state after window is ready
    if (wasMaximized) {
        win.maximize();
    }

    // Register main window with label 'main' (mirrors Tauri's window labeling)
    // Trust cleanup is handled by registerWindow's closed handler
    registerWindow(win, 'main');

    // uncomment line below if you want to open dev tools at app start
    // win.webContents.openDevTools();

    // Load Phoenix from configured URL
    win.loadURL(phoenixLoadURL);
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

// Quit when all registered Phoenix windows are closed (metrics window doesn't count)
setOnAllWindowsClosed(() => {
    gracefulShutdown(0);
});

/**
 * IPC handlers for electronAPI
 * Preload location: contextBridge.exposeInMainWorld('electronAPI', { ... })
 */

// Set zoom factor on the webview (mirrors Tauri's zoom_window)
ipcMain.handle('zoom-window', (event, scaleFactor) => {
    assertTrusted(event);
    event.sender.setZoomFactor(scaleFactor);
});

// In-memory storage for multi-window sync (mirrors Tauri's put_item/get_all_items)
ipcMain.handle('put-item', (event, key, value) => {
    assertTrusted(event);
    sharedStorageMap.set(key, value);
});

ipcMain.handle('get-all-items', (event) => {
    assertTrusted(event);
    return Object.fromEntries(sharedStorageMap);
});

// Toggle DevTools
ipcMain.handle('toggle-dev-tools', (event) => {
    assertTrusted(event);
    event.sender.toggleDevTools();
});

// Get path to phnode binary
ipcMain.handle('get-phnode-path', (event) => {
    assertTrusted(event);
    const phNodePath = getPhNodePath();
    if (!fs.existsSync(phNodePath)) {
        throw new Error(`phnode binary does not exist: ${phNodePath}`);
    }
    return phNodePath;
});

// Get path to src-node
ipcMain.handle('get-src-node-path', (event) => {
    assertTrusted(event);
    const srcNodePath = getSrcNodePath();
    if (!fs.existsSync(srcNodePath)) {
        throw new Error(`src-node path does not exist: ${srcNodePath}`);
    }
    return srcNodePath;
});

// Health metrics forwarding to hidden metrics window (no assertTrusted needed - metrics come from Phoenix windows)
ipcMain.on('send-health-metric', (event, payload) => {
    if (metricsWindow && !metricsWindow.isDestroyed()) {
        metricsWindow.webContents.send('health-metric', payload);
    }
});

// Handle quit request from renderer
app.on('quit-requested', (exitCode) => {
    gracefulShutdown(exitCode);
});

// Handle second instance attempts - forward args to existing windows
app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Forward to all windows via IPC
    // Window focusing is handled by the renderer's singleInstanceHandler
    // Filter out internal electron args (executable and main.js script)
    const filteredArgs = filterCliArgs(commandLine);
    BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
            win.webContents.send('single-instance', {
                args: filteredArgs,
                cwd: workingDirectory
            });
        }
    });
});

app.whenReady().then(async () => {
    // Remove default menu bar
    Menu.setApplicationMenu(null);

    // Register phtauri:// protocol for serving Phoenix files
    // In dev: serves from ../phoenix/ (URL includes /src/ prefix from config.json)
    // In packaged: serves from resources/phoenix-dist (URL has no /src/ prefix)
    const phoenixBasePath = app.isPackaged
        ? path.join(process.resourcesPath, 'phoenix-dist')
        : path.resolve(__dirname, '..', '..', 'phoenix');

    protocol.handle('phtauri', (request) => {
        try {
            const url = new URL(request.url);
            let requestedPath = decodeURIComponent(url.pathname);

            // Serve index.html for directory requests
            if (requestedPath.endsWith('/')) {
                requestedPath += 'index.html';
            }

            const filePath = path.join(phoenixBasePath, requestedPath);
            const normalizedFilePath = path.normalize(filePath);

            // Security: Ensure path is under phoenix base (prevent directory traversal)
            if (!normalizedFilePath.startsWith(phoenixBasePath)) {
                console.error('phtauri access denied - path not under phoenix base:', requestedPath);
                return new Response('Access denied', { status: 403 });
            }

            return net.fetch(`file://${normalizedFilePath}`);
        } catch (err) {
            console.error('phtauri protocol error:', err);
            return new Response('Not found', { status: 404 });
        }
    });

    // Register asset:// protocol for serving local files from appLocalData/assets/
    const appDataDir = getAppDataDir();
    const assetsDir = path.join(appDataDir, 'assets');

    protocol.handle('asset', (request) => {
        try {
            const url = new URL(request.url);
            // Decode the path from URL encoding
            let requestedPath = decodeURIComponent(url.pathname);
            // On Windows, URL pathname has extra leading / before drive letter (e.g., /C:/...)
            if (/^\/[A-Z]:/i.test(requestedPath)) {
                requestedPath = requestedPath.substring(1);
            }
            const normalizedRequested = path.normalize(requestedPath);
            const normalizedAssetsDir = path.normalize(assetsDir);

            // Security: Ensure path is under assets directory (prevent directory traversal)
            if (!normalizedRequested.startsWith(normalizedAssetsDir)) {
                console.error('Asset access denied - path not under assets dir:', requestedPath);
                return new Response('Access denied', { status: 403 });
            }

            return net.fetch(`file://${normalizedRequested}`);
        } catch (err) {
            console.error('Asset protocol error:', err);
            return new Response('Not found', { status: 404 });
        }
    });

    await createMetricsWindow();
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
