/**
 * Centralized Configuration Module
 *
 * This module provides a single source of truth for all configuration values.
 * It reads from package.json and can apply stage-wise transforms as needed.
 *
 * Usage:
 *   const { stage, trustedElectronDomains, productName } = require('./config');
 */

const packageJson = require('./package.json');

// Core package.json values
const name = packageJson.name;
const identifier = packageJson.identifier;
const stage = packageJson.stage;
const version = packageJson.version;
const productName = packageJson.productName;
const description = packageJson.description;

// Security configuration
const trustedElectronDomains = packageJson.trustedElectronDomains || [];

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
    // Package info
    name,
    identifier,
    stage,
    version,
    productName,
    description,

    // Security
    trustedElectronDomains,

    // Initialization
    initConfig
};
