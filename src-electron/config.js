/**
 * Centralized Configuration Module
 *
 * This module provides a single source of truth for all configuration values.
 * It reads from config.json and can apply stage-wise transforms as needed.
 *
 * Usage:
 *   const { stage, trustedElectronDomains, productName } = require('./config');
 */

const configJson = require('./config-effective.json');

// Core config values
const identifier = configJson.identifier;
const phoenixLoadURL = configJson.phoenixLoadURL;
const stage = configJson.stage;
const version = configJson.version;
const productName = configJson.productName;

// Security configuration
const trustedElectronDomains = configJson.trustedElectronDomains || [];

/**
 * Initialize configuration (call once at app startup if needed).
 * Currently a no-op but can be extended for async config loading,
 * environment variable overrides, or stage-wise transforms.
 */
function initConfig() {
    // Future: Add stage-wise transforms, env overrides, etc.
    // Example:
    // if (stage === 'prod') {
    //     // Apply production-specific config
    // }
}

module.exports = {
    // App info
    identifier,
    phoenixLoadURL,
    stage,
    version,
    productName,

    // Security
    trustedElectronDomains,

    // Initialization
    initConfig
};
