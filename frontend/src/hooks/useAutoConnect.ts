import { useState, useEffect, useCallback, useRef } from "react";
import { getBackendNodes, setStoredNodeIndex, getStoredNodeIndex } from "../config";

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
    const [retryTrigger, setRetryTrigger] = useState(0);

    const nodes = getBackendNodes();
    const isConnectingRef = useRef(false);
    const hasConnectedRef = useRef(false);

    // Store callbacks in refs to avoid dependency issues
    const callbacksRef = useRef({ onConnected, onConnectionFailed });
    useEffect(() => {
        callbacksRef.current = { onConnected, onConnectionFailed };
    }, [onConnected, onConnectionFailed]);

    useEffect(() => {
        // Prevent multiple concurrent connection attempts
        if (isConnectingRef.current) {
            return;
        }

        isConnectingRef.current = true;
        hasConnectedRef.current = false;
        setIsConnecting(true);
        setConnectionFailed(false);

        const websockets: WebSocket[] = [];
        const timeouts: ReturnType<typeof setTimeout>[] = [];

        const cleanup = () => {
            timeouts.forEach((t) => clearTimeout(t));
            websockets.forEach((ws) => {
                ws.onopen = null;
                ws.onerror = null;
                ws.onclose = null;
                if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
                    ws.close();
                }
            });
        };

        const handleSuccess = (nodeIndex: number, ws: WebSocket) => {
            if (hasConnectedRef.current) {
                ws.close();
                return;
            }
            hasConnectedRef.current = true;
            cleanup();

            const node = nodes[nodeIndex];
            console.log(`[AutoConnect] Connected to ${node.name}!`);
            setConnectedNodeIndex(nodeIndex);
            setStoredNodeIndex(nodeIndex);
            setIsConnecting(false);
            setConnectionFailed(false);
            isConnectingRef.current = false;
            callbacksRef.current.onConnected?.(nodeIndex, node.name);
            ws.close(); // Close test connection, actual hook will reconnect
        };

        const tryConnect = (nodeIndex: number) => {
            if (hasConnectedRef.current || nodeIndex >= nodes.length) {
                return;
            }

            const node = nodes[nodeIndex];
            console.log(`[AutoConnect] Trying ${node.name} at ${node.url}...`);

            const ws = new WebSocket(node.url);
            websockets.push(ws);

            const timeout = setTimeout(() => {
                if (!hasConnectedRef.current && ws.readyState !== WebSocket.OPEN) {
                    console.log(`[AutoConnect] ${node.name} timed out`);
                    ws.onopen = null;
                    ws.onerror = null;
                    ws.close();
                }
            }, 1500); // 1.5 second timeout per node
            timeouts.push(timeout);

            ws.onopen = () => {
                clearTimeout(timeout);
                handleSuccess(nodeIndex, ws);
            };

            ws.onerror = () => {
                clearTimeout(timeout);
                console.log(`[AutoConnect] ${node.name} failed`);
            };
        };

        // Try stored node first (if available), then try all nodes in parallel
        const storedIndex = getStoredNodeIndex();

        if (storedIndex !== null) {
            // Try stored node first with a short timeout
            const storedNode = nodes[storedIndex];
            console.log(`[AutoConnect] Trying stored node ${storedNode.name} first...`);

            const ws = new WebSocket(storedNode.url);
            websockets.push(ws);

            const storedTimeout = setTimeout(() => {
                if (!hasConnectedRef.current) {
                    console.log(`[AutoConnect] Stored node timed out, trying all nodes...`);
                    ws.onopen = null;
                    ws.onerror = null;
                    ws.close();
                    // Try all nodes in parallel
                    nodes.forEach((_, index) => tryConnect(index));

                    // Set a final timeout to detect all failures
                    const finalTimeout = setTimeout(() => {
                        if (!hasConnectedRef.current) {
                            console.error("[AutoConnect] All nodes failed to connect");
                            cleanup();
                            isConnectingRef.current = false;
                            setIsConnecting(false);
                            setConnectionFailed(true);
                            callbacksRef.current.onConnectionFailed?.();
                        }
                    }, 2000);
                    timeouts.push(finalTimeout);
                }
            }, 1000); // 1 second for stored node
            timeouts.push(storedTimeout);

            ws.onopen = () => {
                clearTimeout(storedTimeout);
                handleSuccess(storedIndex, ws);
            };

            ws.onerror = () => {
                clearTimeout(storedTimeout);
                if (!hasConnectedRef.current) {
                    console.log(`[AutoConnect] Stored node failed, trying all nodes...`);
                    // Try all nodes in parallel
                    nodes.forEach((_, index) => tryConnect(index));

                    // Set a final timeout to detect all failures
                    const finalTimeout = setTimeout(() => {
                        if (!hasConnectedRef.current) {
                            console.error("[AutoConnect] All nodes failed to connect");
                            cleanup();
                            isConnectingRef.current = false;
                            setIsConnecting(false);
                            setConnectionFailed(true);
                            callbacksRef.current.onConnectionFailed?.();
                        }
                    }, 2000);
                    timeouts.push(finalTimeout);
                }
            };
        } else {
            // No stored node, try all nodes in parallel for fastest connection
            console.log(`[AutoConnect] No stored node, trying all nodes in parallel...`);
            nodes.forEach((_, index) => tryConnect(index));

            // Set a final timeout to detect all failures
            const finalTimeout = setTimeout(() => {
                if (!hasConnectedRef.current) {
                    console.error("[AutoConnect] All nodes failed to connect");
                    cleanup();
                    isConnectingRef.current = false;
                    setIsConnecting(false);
                    setConnectionFailed(true);
                    callbacksRef.current.onConnectionFailed?.();
                }
            }, 2000);
            timeouts.push(finalTimeout);
        }

        return () => {
            isConnectingRef.current = false;
            cleanup();
        };
    }, [nodes, retryTrigger]);

    const retry = useCallback(() => {
        hasConnectedRef.current = false;
        isConnectingRef.current = false;
        setConnectedNodeIndex(null);
        setRetryTrigger((t) => t + 1);
    }, []);

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
