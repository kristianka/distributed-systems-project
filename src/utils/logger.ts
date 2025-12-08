/**
 * Custom logger that prepends timestamp and optional node ID to all log messages.
 */

const getTimestamp = (): string => {
    const now = new Date();
    return now.toISOString().slice(0, 19).replace("T", " ");
};

let nodePrefix = "";

/**
 * Set the node ID prefix for all log messages.
 */
export const setLoggerNodeId = (nodeId: string): void => {
    nodePrefix = `[${nodeId}]`;
};

const getPrefix = (): string => {
    return nodePrefix ? `[${getTimestamp()}] ${nodePrefix}` : `[${getTimestamp()}]`;
};

/**
 * Custom console logger with timestamp and node ID prefix.
 */
export const logger = {
    log: (...args: unknown[]): void => {
        console.log(getPrefix(), ...args);
    },

    error: (...args: unknown[]): void => {
        console.error(getPrefix(), ...args);
    },

    warn: (...args: unknown[]): void => {
        console.warn(getPrefix(), ...args);
    },

    info: (...args: unknown[]): void => {
        console.info(getPrefix(), ...args);
    },

    debug: (...args: unknown[]): void => {
        console.debug(getPrefix(), ...args);
    }
};
