/**
 * Backend node configuration.
 *
 * Requires VITE_NODES environment variable.
 *
 * Format: name:url or just url (name will be auto-generated)
 *   VITE_NODES=Node A:ws://localhost:8741/ws,Node B:ws://localhost:8742/ws
 *   VITE_NODES=ws://localhost:8741/ws,ws://localhost:8742/ws
 *
 * For production:
 *   VITE_NODES=Server 1:ws://server1.example.com:8741/ws,Server 2:ws://server2.example.com:8741/ws
 */

export interface BackendNode {
    name: string;
    url: string;
}

/**
 * Parse nodes from VITE_NODES environment variable.
 * Format: name:url,name:url,... or url,url,...
 */
export function getBackendNodes(): BackendNode[] {
    const nodesEnv = import.meta.env.VITE_NODES;

    if (!nodesEnv) {
        throw new Error(
            "VITE_NODES environment variable is required.\n" +
                "Format: name:url,name:url,... or just url,url,...\n" +
                "Example: VITE_NODES=Node A:ws://localhost:8741/ws,Node B:ws://localhost:8742/ws"
        );
    }

    const nodeStrings = nodesEnv
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);

    return nodeStrings.map((nodeStr: string, index: number) => {
        // Check if format is name:ws:// or name:wss://
        const wsMatch = nodeStr.match(/^(.+?):(wss?:\/\/.+)$/);

        if (wsMatch) {
            // Has a name prefix
            return {
                name: wsMatch[1]!,
                url: wsMatch[2]!
            };
        } else {
            // Just a URL, generate name
            return {
                name: `Node ${String.fromCharCode(65 + index)}`, // A, B, C, D...
                url: nodeStr
            };
        }
    });
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
