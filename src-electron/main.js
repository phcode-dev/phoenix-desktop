const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');

const { registerAppIpcHandlers, terminateAllProcesses } = require('./main-app-ipc');
const { registerFsIpcHandlers, getAppDataDir } = require('./main-fs-ipc');

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

    // Load the test page from the http-server
    mainWindow.loadURL('http://localhost:8000/src/');

    // Open DevTools for debugging
    mainWindow.webContents.openDevTools();

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

// Handle quit request from renderer
app.on('quit-requested', (exitCode) => {
    gracefulShutdown(exitCode);
});

app.whenReady().then(async () => {
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

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Handle process termination signals
process.on('SIGINT', () => gracefulShutdown(0));
process.on('SIGTERM', () => gracefulShutdown(0));
