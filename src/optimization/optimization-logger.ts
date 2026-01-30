// Optimization logging module - isolated to avoid circular imports

export const optimizationLogs: string[] = [];

// Track messages that should only be logged once per optimization run
const loggedOnceMessages = new Set<string>();

// Track last logged message to prevent consecutive duplicates
let lastLoggedMessage: string | null = null;

// Current verbosity level - 'normal' shows only essential logs, 'verbose' shows all
let verbosity: 'normal' | 'verbose' = 'normal';

// Progress tracking - best residual seen so far in multi-step solve
let bestResidualSoFar: number = Infinity;
let lastResidual: number = Infinity;

// Candidate tracking - which candidate is being tested
let currentCandidate: number = 0;
let totalCandidates: number = 0;

// Check if we're running in test environment
const isTest = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

// Allow enabling console logs during tests via environment variable
const FORCE_CONSOLE_LOGS = typeof process !== 'undefined' && process.env.Rotera_VERBOSE_TESTS === 'true';

// Callback for real-time log updates (UI can subscribe to this)
let onLogCallback: ((message: string) => void) | null = null;

export function setLogCallback(callback: ((message: string) => void) | null) {
  onLogCallback = callback;
}

/**
 * Set verbosity level for optimization logging.
 * - 'normal': Only essential logs (version, summary, errors, warnings)
 * - 'verbose': All logs including debug details
 */
export function setVerbosity(level: 'normal' | 'verbose') {
  verbosity = level;
}

/**
 * Main log function - always logs to array and console (respecting test mode).
 * Use logDebug() for verbose/debug messages that should be hidden in normal mode.
 */
export function log(message: string) {
  // Skip consecutive duplicate messages
  if (message === lastLoggedMessage) {
    return;
  }
  lastLoggedMessage = message;

  const isVpDebug = message.startsWith('[VP Debug]');

  // Only log to console if not in test mode (unless forced)
  const shouldLogToConsole = !isTest || FORCE_CONSOLE_LOGS;

  if (shouldLogToConsole) {
    console.log(message);
  }

  optimizationLogs.push(message);

  // Notify callback if set (for real-time UI updates) - skip VP Debug
  if (onLogCallback && !isVpDebug) {
    onLogCallback(message);
  }
}

/**
 * Debug log function - only logs when verbosity is 'verbose'.
 * Use this for detailed internal state, VP calculations, step-by-step progress, etc.
 */
export function logDebug(message: string) {
  if (verbosity !== 'verbose') {
    return;
  }
  log(message);
}

export function clearOptimizationLogs() {
  optimizationLogs.length = 0;
  loggedOnceMessages.clear();
  lastLoggedMessage = null;
  bestResidualSoFar = Infinity;
  lastResidual = Infinity;
  currentCandidate = 0;
  totalCandidates = 0;
}

/**
 * Log a solve step with progress tracking.
 * Shows whether we're improving (↓) or worsening (↑) compared to best so far.
 */
export function logProgress(stage: string, residual: number, details: string = '') {
  const isBest = residual < bestResidualSoFar;
  const trend = residual < lastResidual ? '↓' : residual > lastResidual ? '↑' : '→';

  if (isBest) {
    bestResidualSoFar = residual;
  }
  lastResidual = residual;

  const bestMarker = isBest ? ' ★' : '';
  const progressInfo = `res=${residual.toFixed(1)} ${trend} (best=${bestResidualSoFar.toFixed(1)})${bestMarker}`;

  log(`[${stage}] ${progressInfo}${details ? ' | ' + details : ''}`);
}

/**
 * Get the best residual seen so far.
 */
export function getBestResidualSoFar(): number {
  return bestResidualSoFar;
}

/**
 * Set candidate testing progress (for UI display).
 */
export function setCandidateProgress(current: number, total: number): void {
  currentCandidate = current;
  totalCandidates = total;
  // Reset best error for each new candidate
  bestResidualSoFar = Infinity;
  lastResidual = Infinity;
}

/**
 * Get candidate testing progress.
 * Returns { current, total } or null if not testing candidates.
 */
export function getCandidateProgress(): { current: number; total: number } | null {
  if (totalCandidates === 0) {
    return null;
  }
  return { current: currentCandidate, total: totalCandidates };
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
