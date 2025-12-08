// Optimization logging module - isolated to avoid circular imports

export const optimizationLogs: string[] = [];

const VP_DEBUG_ENABLED = process.env.VP_DEBUG === '1';

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
