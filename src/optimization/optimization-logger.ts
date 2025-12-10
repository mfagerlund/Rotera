// Optimization logging module - isolated to avoid circular imports

export const optimizationLogs: string[] = [];

// Debug flag - set to true to enable VP debug messages in console
const VP_DEBUG_ENABLED = false;

// Check if we're running in test environment
const isTest = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

// Allow enabling console logs during tests via environment variable
const FORCE_CONSOLE_LOGS = typeof process !== 'undefined' && process.env.PICTORIGO_VERBOSE_TESTS === 'true';

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
}

export function clearOptimizationLogs() {
  optimizationLogs.length = 0;
}
