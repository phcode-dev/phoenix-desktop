/**
 * Window State Manager
 *
 * Persists and restores window position, size, and maximized state.
 * Handles multi-monitor setups and gracefully handles disconnected monitors.
 */

const { screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { getAppDataDir } = require('./main-fs-ipc');

const STATE_FILE = 'window-state.json';

// Default window dimensions
const DEFAULTS = {
    width: 1366,
    height: 900,
    minWidth: 800,
    minHeight: 600
};

/**
 * Get the path to the window state file.
 */
function getStateFilePath() {
    return path.join(getAppDataDir(), STATE_FILE);
}

/**
 * Load saved window state from disk.
 * Returns null if no saved state or file is corrupted.
 */
function loadWindowState() {
    try {
        const filePath = getStateFilePath();
        if (!fs.existsSync(filePath)) {
            return null;
        }
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.warn('Failed to load window state:', err.message);
        return null;
    }
}

/**
 * Save window state to disk.
 */
function saveWindowState(state) {
    try {
        const filePath = getStateFilePath();
        // Ensure directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
    } catch (err) {
        console.warn('Failed to save window state:', err.message);
    }
}

/**
 * Check if a rectangle is visible on any display.
 * Returns true if at least a portion of the window would be visible.
 */
function isVisibleOnAnyDisplay(bounds) {
    const displays = screen.getAllDisplays();
    const minVisibleArea = 100; // At least 100px visible

    for (const display of displays) {
        const { x, y, width, height } = display.workArea;

        // Calculate overlap between window bounds and display work area
        const overlapX = Math.max(0, Math.min(bounds.x + bounds.width, x + width) - Math.max(bounds.x, x));
        const overlapY = Math.max(0, Math.min(bounds.y + bounds.height, y + height) - Math.max(bounds.y, y));
        const overlapArea = overlapX * overlapY;

        if (overlapArea >= minVisibleArea) {
            return true;
        }
    }
    return false;
}

/**
 * Get the display nearest to a point.
 */
function getNearestDisplay(x, y) {
    return screen.getDisplayNearestPoint({ x, y });
}

/**
 * Get window options with restored state or defaults.
 * Validates saved position is on a visible display.
 */
function getWindowOptions() {
    const savedState = loadWindowState();

    const options = {
        width: DEFAULTS.width,
        height: DEFAULTS.height,
        minWidth: DEFAULTS.minWidth,
        minHeight: DEFAULTS.minHeight
    };

    if (savedState) {
        // Restore size (clamped to minimums)
        options.width = Math.max(savedState.width || DEFAULTS.width, DEFAULTS.minWidth);
        options.height = Math.max(savedState.height || DEFAULTS.height, DEFAULTS.minHeight);

        // Check if saved position is visible on any current display
        if (savedState.x !== undefined && savedState.y !== undefined) {
            const bounds = {
                x: savedState.x,
                y: savedState.y,
                width: options.width,
                height: options.height
            };

            if (isVisibleOnAnyDisplay(bounds)) {
                // Position is valid, use it
                options.x = savedState.x;
                options.y = savedState.y;
            } else {
                // Position is off-screen (monitor disconnected?), center on nearest display
                const nearestDisplay = getNearestDisplay(savedState.x, savedState.y);
                const { x, y, width, height } = nearestDisplay.workArea;
                options.x = x + Math.round((width - options.width) / 2);
                options.y = y + Math.round((height - options.height) / 2);
                console.log('Window position was off-screen, repositioned to nearest display');
            }
        }

        // Track if we need to maximize after window is created
        options._wasMaximized = savedState.isMaximized || false;
    }

    return options;
}

/**
 * Track window state and save on close.
 * Call this after creating the BrowserWindow.
 */
function trackWindowState(win) {
    win.on('close', () => {
        // getNormalBounds() returns the non-maximized bounds even when maximized
        const bounds = win.getNormalBounds();
        const windowState = {
            width: bounds.width,
            height: bounds.height,
            x: bounds.x,
            y: bounds.y,
            isMaximized: win.isMaximized()
        };
        saveWindowState(windowState);
    });
}

module.exports = {
    DEFAULTS,
    getWindowOptions,
    trackWindowState
};
