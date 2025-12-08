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

            const timeoutDuration = isStoredNode ? 1000 : 1500;
            const timeout = setTimeout(() => {
                if (!hasConnectedRef.current && ws.readyState !== WebSocket.OPEN) {
                    console.log(`[NodeStatus] ${node.name} timed out`);
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

            // After a short delay, try other nodes in parallel
            const fallbackTimeout = setTimeout(() => {
                if (!hasConnectedRef.current) {
                    console.log(`[NodeStatus] Stored node slow/failed, trying all nodes...`);
                    nodes.forEach((_, index) => {
                        if (index !== storedIndex) {
                            tryConnect(index);
                        }
                    });
                }
            }, 500);
            timeouts.push(fallbackTimeout);
        } else {
            // No stored node, try all nodes in parallel
            console.log(`[NodeStatus] No stored node, trying all nodes in parallel...`);
            nodes.forEach((_, index) => tryConnect(index));
        }

        // Final timeout to detect all failures
        const finalTimeout = setTimeout(() => {
            if (!hasConnectedRef.current) {
                console.error("[NodeStatus] All nodes failed to connect");
                cleanup();
                isConnectingRef.current = false;
                setIsConnecting(false);
                setConnectionFailed(true);
                lastCheckRef.current = Date.now();
            }
        }, 3000);
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
        refreshStatuses
    };

    return <NodeStatusContext.Provider value={value}>{children}</NodeStatusContext.Provider>;
}
