// Optimization logging module - isolated to avoid circular imports

export const optimizationLogs: string[] = [];

export function log(message: string) {
  console.log(message);
  optimizationLogs.push(message);
}

export function clearOptimizationLogs() {
  optimizationLogs.length = 0;
}
