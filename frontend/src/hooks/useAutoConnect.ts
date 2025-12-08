import { useState, useEffect, useCallback, useRef } from "react";
import { getBackendNodes, setStoredNodeIndex } from "../config";

interface UseAutoConnectOptions {
    onConnected?: (nodeIndex: number, nodeName: string) => void;
    onConnectionFailed?: () => void;
}

interface UseAutoConnectReturn {
    connectedNodeIndex: number | null;
    connectedNodeName: string | null;
    connectedUrl: string | null;
    isConnecting: boolean;
    connectionFailed: boolean;
    retry: () => void;
}

/**
 * Hook that automatically tries to connect to backend nodes in order.
 * If one fails, it tries the next one. Once connected, it remembers the node.
 */
export function useAutoConnect(options: UseAutoConnectOptions = {}): UseAutoConnectReturn {
    const { onConnected, onConnectionFailed } = options;

    const [connectedNodeIndex, setConnectedNodeIndex] = useState<number | null>(null);
    const [isConnecting, setIsConnecting] = useState(true);
    const [connectionFailed, setConnectionFailed] = useState(false);
    const [attemptCount, setAttemptCount] = useState(0);

    const nodes = getBackendNodes();
    const attemptsRef = useRef<Set<number>>(new Set());
    const wsRef = useRef<WebSocket | null>(null);

    const tryConnect = useCallback(
        (nodeIndex: number) => {
            if (nodeIndex >= nodes.length) {
                // All nodes failed
                console.error("[AutoConnect] All nodes failed to connect");
                setIsConnecting(false);
                setConnectionFailed(true);
                onConnectionFailed?.();
                return;
            }

            const node = nodes[nodeIndex];
            console.log(`[AutoConnect] Trying ${node.name} at ${node.url}...`);

            // Close any existing connection
            if (wsRef.current) {
                wsRef.current.close();
            }

            const ws = new WebSocket(node.url);
            wsRef.current = ws;

            const timeout = setTimeout(() => {
                if (ws.readyState !== WebSocket.OPEN) {
                    console.log(`[AutoConnect] ${node.name} timed out, trying next...`);
                    ws.close();
                    tryConnect(nodeIndex + 1);
                }
            }, 3000); // 3 second timeout per node

            ws.onopen = () => {
                clearTimeout(timeout);
                console.log(`[AutoConnect] Connected to ${node.name}!`);
                setConnectedNodeIndex(nodeIndex);
                setStoredNodeIndex(nodeIndex);
                setIsConnecting(false);
                setConnectionFailed(false);
                onConnected?.(nodeIndex, node.name);
                ws.close(); // Close test connection, actual hook will reconnect
            };

            ws.onerror = () => {
                clearTimeout(timeout);
                console.log(`[AutoConnect] ${node.name} failed, trying next...`);
                tryConnect(nodeIndex + 1);
            };

            ws.onclose = (event) => {
                // Only try next if we haven't connected yet
                if (connectedNodeIndex === null && !event.wasClean) {
                    clearTimeout(timeout);
                }
            };
        },
        [nodes, connectedNodeIndex, onConnected, onConnectionFailed]
    );

    // Start connection attempts
    useEffect(() => {
        if (attemptCount === 0 || connectionFailed) return;

        attemptsRef.current.clear();
        setIsConnecting(true);
        setConnectionFailed(false);
        setConnectedNodeIndex(null);

        // Shuffle nodes for load balancing
        const startIndex = Math.floor(Math.random() * nodes.length);
        tryConnect(startIndex);

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [attemptCount]);

    // Initial connection
    useEffect(() => {
        // Shuffle nodes for load balancing
        const startIndex = Math.floor(Math.random() * nodes.length);
        tryConnect(startIndex);

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, []);

    const retry = useCallback(() => {
        setAttemptCount((c) => c + 1);
        setIsConnecting(true);
        setConnectionFailed(false);
        const startIndex = Math.floor(Math.random() * nodes.length);
        tryConnect(startIndex);
    }, [nodes, tryConnect]);

    return {
        connectedNodeIndex,
        connectedNodeName:
            connectedNodeIndex !== null ? nodes[connectedNodeIndex]?.name || null : null,
        connectedUrl: connectedNodeIndex !== null ? nodes[connectedNodeIndex]?.url || null : null,
        isConnecting,
        connectionFailed,
        retry
    };
}
