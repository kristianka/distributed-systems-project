import { useState, useEffect, useRef } from "react";
import { useNodeStatus, NodeStatusType } from "../context";
import { getStatusIcon, getStatusText, getStatusClass } from "../utils/nodeStatus";

export function NodeStatusTooltip() {
    const [isOpen, setIsOpen] = useState(false);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { nodeStatuses, refreshStatuses, connectToNode, connectedNodeIndex } = useNodeStatus();

    const canConnect = (status: NodeStatusType, index: number) => {
        return status === "available" && index !== connectedNodeIndex;
    };

    const handleMouseEnter = () => {
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
        setIsOpen(true);
    };

    const handleMouseLeave = () => {
        closeTimeoutRef.current = setTimeout(() => {
            setIsOpen(false);
        }, 300);
    };

    // Refresh statuses when tooltip opens
    useEffect(() => {
        if (isOpen) {
            refreshStatuses();
        }
    }, [isOpen, refreshStatuses]);

    // Close tooltip when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    return (
        <div className="relative" ref={tooltipRef}>
            <button
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onClick={() => setIsOpen(!isOpen)}
                className="text-zinc-400 hover:text-zinc-200 transition-colors p-1.5 rounded-full hover:bg-zinc-800"
                aria-label="Node connection status"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4" />
                    <path d="M12 8h.01" />
                </svg>
            </button>

            {isOpen && (
                <div
                    className="absolute right-0 top-full mt-2 w-72 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50"
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                >
                    <div className="px-4 py-3 border-b border-zinc-700">
                        <h3 className="font-semibold text-white">Node Status</h3>
                        <p className="text-xs text-zinc-400 mt-0.5">
                            Connection status to all available nodes
                        </p>
                    </div>
                    <ul className="py-2">
                        {nodeStatuses.map((nodeStatus, index) => (
                            <li
                                key={index}
                                className="px-4 py-2 flex items-center justify-between hover:bg-zinc-700/50"
                            >
                                <div className="flex items-center gap-2">
                                    {getStatusIcon(nodeStatus.status)}
                                    <span className="text-sm text-white">
                                        {nodeStatus.node.name}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`text-xs px-2 py-0.5 rounded-full ${getStatusClass(
                                            nodeStatus.status
                                        )}`}
                                    >
                                        {getStatusText(nodeStatus.status)}
                                    </span>
                                    {canConnect(nodeStatus.status, index) && (
                                        <button
                                            onClick={() => connectToNode(index)}
                                            className="text-xs px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                                        >
                                            Connect
                                        </button>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                    <div className="px-4 py-2 border-t border-zinc-700 text-xs text-zinc-500">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            <span className="flex items-center gap-1">
                                <span className="text-emerald-400">●</span> Connected
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="text-blue-400">●</span> Available
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="text-orange-400">●</span> Connecting
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="text-red-400">●</span> Offline
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
