// Suppress noisy but harmless React dev warnings only
const originalConsoleWarn = console.warn;

console.warn = (...args) => {
  const message = args[0];
  if (typeof message === 'string') {
    if (message.includes('validateDOMNesting')) return;
    if (message.includes('Warning: Function components cannot be given refs')) return;
  }
  originalConsoleWarn.apply(console, args);
};

export const restoreConsole = () => {
  console.warn = originalConsoleWarn;
};

export default { init: () => {} };
