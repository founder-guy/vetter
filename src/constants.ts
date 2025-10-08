/**
 * Timeout for npm install operations (180 seconds)
 * Used for package-lock.json generation in temporary workspaces
 * Large packages (1000+ dependencies) can take 2-3 minutes to resolve dependency trees
 */
export const NPM_INSTALL_TIMEOUT = 180_000;

/**
 * Timeout for npm audit operations (120 seconds)
 * Auditing large dependency trees requires significant npm registry API calls
 */
export const NPM_AUDIT_TIMEOUT = 120_000;
