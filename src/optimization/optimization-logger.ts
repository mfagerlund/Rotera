// Optimization logging module - isolated to avoid circular imports

export const optimizationLogs: string[] = [];

// Debug flag - set to true to enable VP debug messages in console
const VP_DEBUG_ENABLED = false;

export function log(message: string) {
  const isVpDebug = message.startsWith('[VP Debug]');
  if (!isVpDebug || VP_DEBUG_ENABLED) {
    console.log(message);
  }
  optimizationLogs.push(message);
}

export function clearOptimizationLogs() {
  optimizationLogs.length = 0;
}
