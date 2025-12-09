import { NodeStatusType } from "../context/NodeStatusContext";

export const getStatusIcon = (status: NodeStatusType) => {
    switch (status) {
        case "connected":
            return <span className="text-emerald-400">●</span>;
        case "available":
            return <span className="text-blue-400">●</span>;
        case "unavailable":
            return <span className="text-red-400">●</span>;
        case "connecting":
            return <span className="text-orange-400 animate-pulse">●</span>;
        case "checking":
            return <span className="text-yellow-400 animate-pulse">●</span>;
    }
};

export const getStatusText = (status: NodeStatusType) => {
    switch (status) {
        case "connected":
            return "Connected";
        case "available":
            return "Available";
        case "unavailable":
            return "Unavailable";
        case "connecting":
            return "Connecting...";
        case "checking":
            return "Checking...";
    }
};

export const getStatusClass = (status: NodeStatusType) => {
    switch (status) {
        case "connected":
            return "bg-emerald-400/20 text-emerald-400";
        case "available":
            return "bg-blue-400/20 text-blue-400";
        case "unavailable":
            return "bg-red-400/20 text-red-400";
        case "connecting":
            return "bg-orange-400/20 text-orange-400";
        case "checking":
            return "bg-yellow-400/20 text-yellow-400";
    }
};
