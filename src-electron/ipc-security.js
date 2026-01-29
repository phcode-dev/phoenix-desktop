/**
 * IPC Security - Trusted Domain Validation
 *
 * This module implements security measures to ensure Electron APIs are only
 * accessible from trusted origins. Trust is evaluated at window load/navigation
 * time (not on every IPC call) for optimal performance.
 *
 * Trust rules:
 * - Dev stage: trustedElectronDomains + all localhost URLs
 * - Other stages (staging/prod): only trustedElectronDomains
 */

const { stage, trustedElectronDomains } = require('./config');

// Track trusted webContents IDs (Set for O(1) lookup)
const _trustedWebContents = new Set();

/**
 * Check if a URL is trusted based on stage configuration.
 * - Dev stage: trustedElectronDomains + all localhost URLs
 * - Other stages: only trustedElectronDomains
 */
function isTrustedOrigin(url) {
    if (!url) return false;

    // Check against trustedElectronDomains
    for (const domain of trustedElectronDomains) {
        if (url.startsWith(domain)) {
            return true;
        }
    }

    // In dev stage, also allow localhost URLs
    if (stage === 'dev') {
        try {
            const parsed = new URL(url);
            if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
                return true;
            }
        } catch {
            return false;
        }
    }

    return false;
}

/**
 * Mark a webContents as trusted/untrusted based on its current URL.
 * Call this when window loads or navigates.
 */
function updateTrustStatus(webContents) {
    const url = webContents.getURL();
    if (isTrustedOrigin(url)) {
        _trustedWebContents.add(webContents.id);
    } else {
        _trustedWebContents.delete(webContents.id);
    }
}

/**
 * Remove trust tracking when webContents is destroyed.
 */
function cleanupTrust(webContentsId) {
    _trustedWebContents.delete(webContentsId);
}

/**
 * Fast check if webContents is trusted (O(1) lookup).
 */
function _isWebContentsTrusted(webContentsId) {
    return _trustedWebContents.has(webContentsId);
}

/**
 * Assert that IPC event comes from trusted webContents.
 * Throws error if not trusted.
 */
function assertTrusted(event) {
    if (!_isWebContentsTrusted(event.sender.id)) {
        const url = event.senderFrame?.url || event.sender.getURL() || 'unknown';
        throw new Error(`Blocked IPC from untrusted origin: ${url}`);
    }
}

module.exports = {
    isTrustedOrigin,
    updateTrustStatus,
    cleanupTrust,
    assertTrusted
};
