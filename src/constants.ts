/**
 * Timeout for npm install operations (60 seconds)
 * Used for package-lock.json generation in temporary workspaces
 */
export const NPM_INSTALL_TIMEOUT = 60_000;

/**
 * Timeout for npm audit operations (30 seconds)
 * Shorter than install since no package installation occurs
 */
export const NPM_AUDIT_TIMEOUT = 30_000;
