// Optimization logging module - isolated to avoid circular imports

export const optimizationLogs: string[] = [];

// Track messages that should only be logged once per optimization run
const loggedOnceMessages = new Set<string>();

// Debug flag - set to true to enable VP debug messages in console
const VP_DEBUG_ENABLED = false;

// Check if we're running in test environment
const isTest = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

// Allow enabling console logs during tests via environment variable
const FORCE_CONSOLE_LOGS = typeof process !== 'undefined' && process.env.PICTORIGO_VERBOSE_TESTS === 'true';

// Callback for real-time log updates (UI can subscribe to this)
let onLogCallback: ((message: string) => void) | null = null;

export function setLogCallback(callback: ((message: string) => void) | null) {
  onLogCallback = callback;
}

export function log(message: string) {
  const isVpDebug = message.startsWith('[VP Debug]');

  // Only log to console if:
  // 1. Not in test mode, OR
  // 2. Force console logs is enabled
  // 3. AND for VP debug messages, VP_DEBUG_ENABLED must be true
  const shouldLogToConsole = (!isTest || FORCE_CONSOLE_LOGS) && (!isVpDebug || VP_DEBUG_ENABLED);

  if (shouldLogToConsole) {
    console.log(message);
  }

  optimizationLogs.push(message);

  // Notify callback if set (for real-time UI updates)
  if (onLogCallback && !isVpDebug) {
    onLogCallback(message);
  }
}

export function clearOptimizationLogs() {
  optimizationLogs.length = 0;
  loggedOnceMessages.clear();
}

/**
 * Log a message only once per optimization run. Useful for warnings that
 * would otherwise spam the log (e.g., VP far from origin warnings).
 */
export function logOnce(message: string) {
  if (loggedOnceMessages.has(message)) {
    return;
  }
  loggedOnceMessages.add(message);
  log(message);
}
