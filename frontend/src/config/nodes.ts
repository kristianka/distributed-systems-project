/**
 * Backend node configuration.
 *
 * Requires VITE_NODES environment variable:
 *   VITE_NODES=ws://localhost:8741/ws,ws://localhost:8742/ws,ws://localhost:8743/ws
 *
 * For production:
 *   VITE_NODES=ws://server1.example.com:8741/ws,ws://server2.example.com:8741/ws
 */

export interface BackendNode {
    name: string;
    url: string;
}

/**
 * Parse nodes from VITE_NODES environment variable.
 * Format: comma-separated WebSocket URLs
 */
export function getBackendNodes(): BackendNode[] {
    const nodesEnv = import.meta.env.VITE_NODES;

    if (!nodesEnv) {
        throw new Error(
            "VITE_NODES environment variable is required.\n" +
                "Format: comma-separated WebSocket URLs\n" +
                "Example: VITE_NODES=ws://localhost:8741/ws,ws://localhost:8742/ws,ws://localhost:8743/ws"
        );
    }

    const urls = nodesEnv
        .split(",")
        .map((url: string) => url.trim())
        .filter(Boolean);

    return urls.map((url: string, index: number) => ({
        name: `Node ${String.fromCharCode(65 + index)}`, // A, B, C, D...
        url
    }));
}

/**
 * Get the stored node index or return null if none stored
 */
export function getStoredNodeIndex(): number | null {
    const stored = localStorage.getItem("connectedNodeIndex");
    if (stored !== null) {
        const index = parseInt(stored, 10);
        const nodes = getBackendNodes();
        if (index >= 0 && index < nodes.length) {
            return index;
        }
    }
    return null;
}

/**
 * Store the connected node index
 */
export function setStoredNodeIndex(index: number): void {
    localStorage.setItem("connectedNodeIndex", String(index));
}

/**
 * Clear the stored node index (for reconnection)
 */
export function clearStoredNodeIndex(): void {
    localStorage.removeItem("connectedNodeIndex");
}
