/**
 * Custom logger that prepends timestamp to all log messages.
 */

const getTimestamp = (): string => {
    const now = new Date();
    return now.toISOString().slice(0, 19).replace("T", " ");
};

/**
 * Custom console logger with timestamp prefix.
 */
export const logger = {
    log: (...args: unknown[]): void => {
        console.log(`[${getTimestamp()}]`, ...args);
    },

    error: (...args: unknown[]): void => {
        console.error(`[${getTimestamp()}]`, ...args);
    },

    warn: (...args: unknown[]): void => {
        console.warn(`[${getTimestamp()}]`, ...args);
    },

    info: (...args: unknown[]): void => {
        console.info(`[${getTimestamp()}]`, ...args);
    },

    debug: (...args: unknown[]): void => {
        console.debug(`[${getTimestamp()}]`, ...args);
    }
};
