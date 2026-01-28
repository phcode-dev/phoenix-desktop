const { ipcMain, BrowserWindow } = require('electron');
const path = require('path');

const PHOENIX_WINDOW_PREFIX = 'phcode-';
const PHOENIX_EXTENSION_WINDOW_PREFIX = 'extn-';
const MAX_WINDOWS = 30;

// Window registry: windowLabel -> BrowserWindow
const windowRegistry = new Map();
// Reverse lookup: webContentsId -> windowLabel
const webContentsToLabel = new Map();

function getNextLabel(prefix) {
    for (let i = 1; i <= MAX_WINDOWS; i++) {
        const label = `${prefix}${i}`;
        if (!windowRegistry.has(label)) {
            return label;
        }
    }
    throw new Error(`No free window label available for prefix: ${prefix}`);
}

function registerWindow(win, label) {
    windowRegistry.set(label, win);
    webContentsToLabel.set(win.webContents.id, label);

    win.on('closed', () => {
        windowRegistry.delete(label);
        webContentsToLabel.delete(win.webContents.id);
    });
}

function registerWindowIpcHandlers() {
    // Get all window labels (mirrors Tauri's _get_window_labels)
    ipcMain.handle('get-window-labels', () => {
        return Array.from(windowRegistry.keys());
    });

    // Get current window's label
    ipcMain.handle('get-current-window-label', (event) => {
        return webContentsToLabel.get(event.sender.id) || null;
    });

    // Create new window (mirrors openURLInPhoenixWindow for Electron)
    ipcMain.handle('create-phoenix-window', async (event, url, options) => {
        const { windowTitle, fullscreen, resizable, height, minHeight, width, minWidth, isExtension } = options || {};

        const prefix = isExtension ? PHOENIX_EXTENSION_WINDOW_PREFIX : PHOENIX_WINDOW_PREFIX;
        const label = getNextLabel(prefix);

        const win = new BrowserWindow({
            width: width || 1366,
            height: height || 900,
            minWidth: minWidth || 800,
            minHeight: minHeight || 600,
            fullscreen: fullscreen || false,
            resizable: resizable !== false,
            title: windowTitle || label,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false
            }
        });

        registerWindow(win, label);
        await win.loadURL(url);

        return label;
    });

    // Close current window
    ipcMain.handle('close-window', async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            win.close();
        }
    });

    // Quit app (for last window scenario)
    ipcMain.handle('quit-app', (event, exitCode) => {
        const { app } = require('electron');
        app.exit(exitCode || 0);
    });

    // Focus current window
    ipcMain.handle('focus-window', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            win.setAlwaysOnTop(true);
            win.focus();
            win.setAlwaysOnTop(false);
        }
    });
}

module.exports = { registerWindowIpcHandlers, registerWindow, windowRegistry };
