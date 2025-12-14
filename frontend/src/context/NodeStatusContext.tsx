import {
    createContext,
    useContext,
    useState,
    useEffect,
    useRef,
    useCallback,
    useMemo,
    ReactNode
} from "react";
import { BackendNode, getBackendNodes, getStoredNodeIndex, setStoredNodeIndex } from "../config";

export type NodeStatusType = "connected" | "available" | "unavailable" | "checking" | "connecting";

export interface NodeStatus {
    node: BackendNode;
    status: NodeStatusType;
}

interface NodeStatusContextValue {
    nodeStatuses: NodeStatus[];
    connectedNodeIndex: number | null;
    connectedNodeName: string | null;
    connectedUrl: string | null;
    isConnecting: boolean;
    connectionFailed: boolean;
    retry: () => void;
    refreshStatuses: () => void;
    /** Call this when the WebSocket connection is lost to trigger automatic failover */
    onConnectionLost: () => void;
    /** Manually connect to a specific node by index */
    connectToNode: (nodeIndex: number) => void;
}

const NodeStatusContext = createContext<NodeStatusContextValue | null>(null);

export function useNodeStatus() {
    const context = useContext(NodeStatusContext);
    if (!context) {
        throw new Error("useNodeStatus must be used within a NodeStatusProvider");
    }
    return context;
}

interface NodeStatusProviderProps {
    children: ReactNode;
}

export function NodeStatusProvider({ children }: NodeStatusProviderProps) {
    // Memoize nodes to prevent infinite loops - getBackendNodes returns a new array each call
    const nodes = useMemo(() => getBackendNodes(), []);

    const [nodeStatuses, setNodeStatuses] = useState<NodeStatus[]>(() =>
        nodes.map((node) => ({ node, status: "checking" as NodeStatusType }))
    );
    const [connectedNodeIndex, setConnectedNodeIndex] = useState<number | null>(null);
    const [isConnecting, setIsConnecting] = useState(true);
    const [connectionFailed, setConnectionFailed] = useState(false);
    const [retryTrigger, setRetryTrigger] = useState(0);

    const isConnectingRef = useRef(false);
    const hasConnectedRef = useRef(false);
    const lastCheckRef = useRef<number>(0);

    // Main connection logic - tries to connect and updates statuses
    useEffect(() => {
        if (isConnectingRef.current) {
            return;
        }

        isConnectingRef.current = true;
        hasConnectedRef.current = false;
        setIsConnecting(true);
        setConnectionFailed(false);

        // Initialize all nodes as "checking"
        setNodeStatuses(nodes.map((node) => ({ node, status: "checking" })));

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

        const updateNodeStatus = (index: number, status: NodeStatusType) => {
            setNodeStatuses((prev) => prev.map((s, i) => (i === index ? { ...s, status } : s)));
        };

        const handleSuccess = (nodeIndex: number, ws: WebSocket) => {
            if (hasConnectedRef.current) {
                ws.close();
                return;
            }
            hasConnectedRef.current = true;

            const node = nodes[nodeIndex];
            console.log(`[NodeStatus] Connected to ${node.name}!`);

            // Update the connected node status
            updateNodeStatus(nodeIndex, "connected");

            setConnectedNodeIndex(nodeIndex);
            setStoredNodeIndex(nodeIndex);
            setIsConnecting(false);
            setConnectionFailed(false);
            isConnectingRef.current = false;
            lastCheckRef.current = Date.now();

            ws.close();
        };

        const handleNodeResult = (nodeIndex: number, success: boolean) => {
            if (hasConnectedRef.current) return;

            if (success) {
                // This will be handled by handleSuccess
            } else {
                updateNodeStatus(nodeIndex, "unavailable");
            }
        };

        const tryConnect = (nodeIndex: number, isStoredNode: boolean = false) => {
            if (hasConnectedRef.current || nodeIndex >= nodes.length) {
                return;
            }

            const node = nodes[nodeIndex];
            console.log(`[NodeStatus] Trying ${node.name} at ${node.url}...`);
            updateNodeStatus(nodeIndex, "connecting");

            const ws = new WebSocket(node.url);
            websockets.push(ws);

            // Increase timeout to 3s for stored node, 4s for others
            const timeoutDuration = isStoredNode ? 3000 : 4000;
            const timeout = setTimeout(() => {
                if (!hasConnectedRef.current && ws.readyState !== WebSocket.OPEN) {
                    console.log(`[NodeStatus] ${node.name} timed out after ${timeoutDuration}ms`);
                    ws.onopen = null;
                    ws.onerror = null;
                    ws.close();
                    handleNodeResult(nodeIndex, false);
                }
            }, timeoutDuration);
            timeouts.push(timeout);

            ws.onopen = () => {
                clearTimeout(timeout);
                if (hasConnectedRef.current) {
                    // Already connected to another node, mark this as available
                    updateNodeStatus(nodeIndex, "available");
                    ws.close();
                } else {
                    handleSuccess(nodeIndex, ws);
                }
            };

            ws.onerror = () => {
                clearTimeout(timeout);
                console.log(`[NodeStatus] ${node.name} failed`);
                handleNodeResult(nodeIndex, false);
            };
        };

        const storedIndex = getStoredNodeIndex();

        if (storedIndex !== null) {
            // Try stored node first
            const storedNode = nodes[storedIndex];
            console.log(`[NodeStatus] Trying stored node ${storedNode.name} first...`);

            tryConnect(storedIndex, true);

            // After 1.5s, try other nodes in parallel if stored node hasn't connected
            const fallbackTimeout = setTimeout(() => {
                if (!hasConnectedRef.current) {
                    console.log(`[NodeStatus] Stored node slow/failed, trying all nodes...`);
                    nodes.forEach((_, index) => {
                        if (index !== storedIndex) {
                            tryConnect(index);
                        }
                    });
                }
            }, 1500);
            timeouts.push(fallbackTimeout);
        } else {
            // No stored node, try all nodes in parallel
            console.log(`[NodeStatus] No stored node, trying all nodes in parallel...`);
            nodes.forEach((_, index) => tryConnect(index));
        }

        // Final timeout to detect all failures (must be longer than individual timeouts)
        const finalTimeout = setTimeout(() => {
            if (!hasConnectedRef.current) {
                console.error("[NodeStatus] All nodes failed to connect");
                cleanup();
                isConnectingRef.current = false;
                setIsConnecting(false);
                setConnectionFailed(true);
                lastCheckRef.current = Date.now();
            }
        }, 6000);
        timeouts.push(finalTimeout);

        return () => {
            isConnectingRef.current = false;
            cleanup();
        };
    }, [nodes, retryTrigger]);

    // Check remaining nodes after connection is established
    useEffect(() => {
        if (connectedNodeIndex === null || isConnecting) return;

        const websockets: WebSocket[] = [];
        const timeouts: ReturnType<typeof setTimeout>[] = [];

        // Give a brief pause after connecting before checking other nodes
        const checkDelay = setTimeout(() => {
            nodes.forEach((node, index) => {
                if (index === connectedNodeIndex) return;

                // Check current status synchronously
                const currentStatus = nodeStatuses[index]?.status;
                if (currentStatus === "available" || currentStatus === "unavailable") {
                    return; // Already have a result
                }

                // Mark as checking
                setNodeStatuses((prev) =>
                    prev.map((s, i) => (i === index ? { ...s, status: "checking" } : s))
                );

                // Create WebSocket to check
                const ws = new WebSocket(node.url);
                websockets.push(ws);

                const timeout = setTimeout(() => {
                    ws.close();
                    setNodeStatuses((p) =>
                        p.map((s, i) => (i === index ? { ...s, status: "unavailable" } : s))
                    );
                }, 2000);
                timeouts.push(timeout);

                ws.onopen = () => {
                    clearTimeout(timeout);
                    ws.close();
                    setNodeStatuses((p) =>
                        p.map((s, i) => (i === index ? { ...s, status: "available" } : s))
                    );
                };

                ws.onerror = () => {
                    clearTimeout(timeout);
                    setNodeStatuses((p) =>
                        p.map((s, i) => (i === index ? { ...s, status: "unavailable" } : s))
                    );
                };
            });
        }, 500);

        return () => {
            clearTimeout(checkDelay);
            timeouts.forEach((t) => clearTimeout(t));
            websockets.forEach((ws) => {
                ws.onopen = null;
                ws.onerror = null;
                if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
                    ws.close();
                }
            });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connectedNodeIndex, isConnecting]);

    const retry = useCallback(() => {
        hasConnectedRef.current = false;
        isConnectingRef.current = false;
        setConnectedNodeIndex(null);
        setRetryTrigger((t) => t + 1);
    }, []);

    // Called when WebSocket connection is lost - triggers immediate failover to another node
    const onConnectionLost = useCallback(() => {
        console.log("[NodeStatus] Connection lost, attempting failover...");

        // Mark current node as unavailable
        if (connectedNodeIndex !== null) {
            setNodeStatuses((prev) =>
                prev.map((s, i) => (i === connectedNodeIndex ? { ...s, status: "unavailable" } : s))
            );
        }

        // Trigger reconnection attempt to find a new node
        hasConnectedRef.current = false;
        isConnectingRef.current = false;
        setConnectedNodeIndex(null);
        setRetryTrigger((t) => t + 1);
    }, [connectedNodeIndex]);

    const connectToNode = useCallback(
        (nodeIndex: number) => {
            if (nodeIndex < 0 || nodeIndex >= nodes.length) {
                console.error(`[NodeStatus] Invalid node index: ${nodeIndex}`);
                return;
            }

            const node = nodes[nodeIndex];
            const currentStatus = nodeStatuses[nodeIndex]?.status;

            // Don't try to connect to unavailable nodes
            if (currentStatus === "unavailable") {
                console.log(`[NodeStatus] Cannot connect to unavailable node: ${node.name}`);
                return;
            }

            // Already connected to this node
            if (nodeIndex === connectedNodeIndex) {
                console.log(`[NodeStatus] Already connected to ${node.name}`);
                return;
            }

            console.log(`[NodeStatus] Manually connecting to ${node.name}...`);

            // Mark current connected node as available (if any)
            if (connectedNodeIndex !== null) {
                setNodeStatuses((prev) =>
                    prev.map((s, i) =>
                        i === connectedNodeIndex ? { ...s, status: "available" } : s
                    )
                );
            }

            // Mark target node as connecting
            setNodeStatuses((prev) =>
                prev.map((s, i) => (i === nodeIndex ? { ...s, status: "connecting" } : s))
            );

            // Try to connect
            const ws = new WebSocket(node.url);
            const timeout = setTimeout(() => {
                ws.close();
                setNodeStatuses((prev) =>
                    prev.map((s, i) => (i === nodeIndex ? { ...s, status: "unavailable" } : s))
                );
            }, 3000);

            ws.onopen = () => {
                clearTimeout(timeout);
                ws.close();

                // Update statuses
                setNodeStatuses((prev) =>
                    prev.map((s, i) => {
                        if (i === nodeIndex) return { ...s, status: "connected" };
                        if (i === connectedNodeIndex) return { ...s, status: "available" };
                        return s;
                    })
                );

                setConnectedNodeIndex(nodeIndex);
                setStoredNodeIndex(nodeIndex);
                console.log(`[NodeStatus] Successfully connected to ${node.name}`);
            };

            ws.onerror = () => {
                clearTimeout(timeout);
                setNodeStatuses((prev) =>
                    prev.map((s, i) => (i === nodeIndex ? { ...s, status: "unavailable" } : s))
                );
                console.log(`[NodeStatus] Failed to connect to ${node.name}`);
            };
        },
        [nodes, nodeStatuses, connectedNodeIndex]
    );

    const refreshStatuses = useCallback(() => {
        const now = Date.now();
        if (now - lastCheckRef.current < 5000) {
            return; // Don't refresh within 5 seconds
        }

        // Re-check non-connected nodes
        nodes.forEach((node, index) => {
            if (index === connectedNodeIndex) return;

            setNodeStatuses((prev) =>
                prev.map((s, i) => (i === index ? { ...s, status: "checking" } : s))
            );

            const ws = new WebSocket(node.url);
            const timeout = setTimeout(() => {
                ws.close();
                setNodeStatuses((p) =>
                    p.map((s, i) => (i === index ? { ...s, status: "unavailable" } : s))
                );
            }, 2000);

            ws.onopen = () => {
                clearTimeout(timeout);
                ws.close();
                setNodeStatuses((p) =>
                    p.map((s, i) => (i === index ? { ...s, status: "available" } : s))
                );
            };

            ws.onerror = () => {
                clearTimeout(timeout);
                setNodeStatuses((p) =>
                    p.map((s, i) => (i === index ? { ...s, status: "unavailable" } : s))
                );
            };
        });

        lastCheckRef.current = now;
    }, [nodes, connectedNodeIndex]);

    const value: NodeStatusContextValue = {
        nodeStatuses,
        connectedNodeIndex,
        connectedNodeName:
            connectedNodeIndex !== null ? nodes[connectedNodeIndex]?.name || null : null,
        connectedUrl: connectedNodeIndex !== null ? nodes[connectedNodeIndex]?.url || null : null,
        isConnecting,
        connectionFailed,
        retry,
        refreshStatuses,
        onConnectionLost,
        connectToNode
    };

    return <NodeStatusContext.Provider value={value}>{children}</NodeStatusContext.Provider>;
}
