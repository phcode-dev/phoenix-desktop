const { ipcMain, BrowserWindow, shell, clipboard } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { cleanupWindowTrust } = require('./main-cred-ipc');
const { updateTrustStatus, cleanupTrust, assertTrusted } = require('./ipc-security');

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

// Track close handlers per window
const windowCloseHandlers = new Map();

function registerWindow(win, label) {
    const webContents = win.webContents;
    const webContentsId = webContents.id;
    windowRegistry.set(label, win);
    webContentsToLabel.set(webContentsId, label);

    // Initial trust evaluation
    updateTrustStatus(webContents);

    // Re-evaluate trust on navigation
    webContents.on('did-navigate', () => {
        updateTrustStatus(webContents);
    });
    webContents.on('did-navigate-in-page', () => {
        updateTrustStatus(webContents);
    });

    win.on('closed', () => {
        windowRegistry.delete(label);
        webContentsToLabel.delete(webContentsId);
        windowCloseHandlers.delete(webContentsId);
        // Clean up AES trust for closing window (mirrors Tauri's on_window_event CloseRequested handler)
        cleanupWindowTrust(webContentsId);
        // Clean up security trust
        cleanupTrust(webContentsId);
    });
}

function setupCloseHandler(win) {
    win.on('close', (event) => {
        const hasHandler = windowCloseHandlers.get(win.webContents.id);
        if (hasHandler && !win.forceClose) {
            event.preventDefault();
            win.webContents.send('close-requested');
        }
    });
}

function registerWindowIpcHandlers() {
    // Get all window labels (mirrors Tauri's _get_window_labels)
    ipcMain.handle('get-window-labels', (event) => {
        assertTrusted(event);
        return Array.from(windowRegistry.keys());
    });

    // Get current window's label
    ipcMain.handle('get-current-window-label', (event) => {
        assertTrusted(event);
        return webContentsToLabel.get(event.sender.id) || null;
    });

    // Create new window (mirrors openURLInPhoenixWindow for Electron)
    ipcMain.handle('create-phoenix-window', async (event, url, options) => {
        assertTrusted(event);
        const { windowTitle, fullscreen, resizable, height, minHeight, width, minWidth, isExtension } = options || {};

        const prefix = isExtension ? PHOENIX_EXTENSION_WINDOW_PREFIX : PHOENIX_WINDOW_PREFIX;
        const label = getNextLabel(prefix);

        const webPreferences = {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        };

        // Only inject preload for Phoenix windows, not extensions
        if (!isExtension) {
            webPreferences.preload = path.join(__dirname, 'preload.js');
        }

        const win = new BrowserWindow({
            width: width || 1366,
            height: height || 900,
            minWidth: minWidth || 800,
            minHeight: minHeight || 600,
            fullscreen: fullscreen || false,
            resizable: resizable !== false,
            title: windowTitle || label,
            webPreferences
        });

        registerWindow(win, label);
        await win.loadURL(url);

        return label;
    });

    // Close current window
    ipcMain.handle('close-window', async (event) => {
        assertTrusted(event);
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            win.close();
        }
    });

    // Focus current window and bring to front
    ipcMain.handle('focus-window', (event) => {
        assertTrusted(event);
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            if (win.isMinimized()) {
                win.restore();
            }
            win.moveTop();
            win.show();
            win.focus();
        }
    });

    // Get process ID
    ipcMain.handle('get-process-id', (event) => {
        assertTrusted(event);
        return process.pid;
    });

    // Get platform architecture
    ipcMain.handle('get-platform-arch', (event) => {
        assertTrusted(event);
        return process.arch;
    });

    // Get current working directory
    ipcMain.handle('get-cwd', (event) => {
        assertTrusted(event);
        return process.cwd();
    });

    // Fullscreen APIs
    ipcMain.handle('is-fullscreen', (event) => {
        assertTrusted(event);
        const win = BrowserWindow.fromWebContents(event.sender);
        return win ? win.isFullScreen() : false;
    });

    ipcMain.handle('set-fullscreen', (event, enable) => {
        assertTrusted(event);
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            win.setFullScreen(enable);
        }
    });

    // Window title APIs
    ipcMain.handle('set-window-title', (event, title) => {
        assertTrusted(event);
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            win.setTitle(title);
        }
    });

    ipcMain.handle('get-window-title', (event) => {
        assertTrusted(event);
        const win = BrowserWindow.fromWebContents(event.sender);
        return win ? win.getTitle() : '';
    });

    // Clipboard APIs
    ipcMain.handle('clipboard-read-text', (event) => {
        assertTrusted(event);
        return clipboard.readText();
    });

    ipcMain.handle('clipboard-write-text', (event, text) => {
        assertTrusted(event);
        clipboard.writeText(text);
    });

    // Read file paths from clipboard (platform-specific)
    ipcMain.handle('clipboard-read-files', (event) => {
        assertTrusted(event);
        const formats = clipboard.availableFormats();

        // Windows: FileNameW format contains file paths
        if (process.platform === 'win32' && formats.includes('FileNameW')) {
            const buffer = clipboard.readBuffer('FileNameW');
            // FileNameW is null-terminated UTF-16LE string
            const paths = buffer.toString('utf16le').split('\0').filter(p => p.length > 0);
            return paths;
        }

        // macOS: public.file-url format
        if (process.platform === 'darwin') {
            // Try reading as file URLs
            const text = clipboard.read('public.file-url');
            if (text) {
                // Convert file:// URLs to paths
                const paths = text.split('\n')
                    .filter(url => url.startsWith('file://'))
                    .map(url => decodeURIComponent(url.replace('file://', '')));
                if (paths.length > 0) {
                    return paths;
                }
            }
        }

        // Linux: text/uri-list format
        if (process.platform === 'linux' && formats.includes('text/uri-list')) {
            const text = clipboard.read('text/uri-list');
            if (text) {
                const paths = text.split('\n')
                    .filter(url => url.startsWith('file://'))
                    .map(url => decodeURIComponent(url.replace('file://', '')));
                if (paths.length > 0) {
                    return paths;
                }
            }
        }

        return null;
    });

    // Shell APIs
    ipcMain.handle('move-to-trash', async (event, platformPath) => {
        assertTrusted(event);
        await shell.trashItem(platformPath);
    });

    ipcMain.handle('show-in-folder', (event, platformPath) => {
        assertTrusted(event);
        shell.showItemInFolder(platformPath);
    });

    ipcMain.handle('open-external', async (event, url) => {
        assertTrusted(event);
        await shell.openExternal(url);
    });

    // Windows-only: open URL in specific browser (fire and forget)
    ipcMain.handle('open-url-in-browser-win', (event, url, browser) => {
        assertTrusted(event);
        if (process.platform !== 'win32') {
            throw new Error('open-url-in-browser-win is only supported on Windows');
        }
        spawn('cmd', ['/c', 'start', browser, url], { shell: true, detached: true, stdio: 'ignore' });
    });

    // Register close handler for current window
    ipcMain.handle('register-close-handler', (event) => {
        assertTrusted(event);
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            windowCloseHandlers.set(win.webContents.id, true);
            setupCloseHandler(win);
        }
    });

    // Allow close after handler approves
    ipcMain.handle('allow-close', (event) => {
        assertTrusted(event);
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            win.forceClose = true;
            win.close();
        }
    });
}

module.exports = { registerWindowIpcHandlers, registerWindow, setupCloseHandler, windowRegistry };
