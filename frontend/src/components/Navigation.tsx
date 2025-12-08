import { useState } from "react";
import { NodeStatusTooltip } from "./NodeStatusTooltip";
import { useNodeStatus } from "../context/NodeStatusContext";
import { Pencil } from "lucide-react";

interface NavigationProps {
    username: string;
    setUsername: (username: string) => void;
}

export const Navigation = ({ username, setUsername }: NavigationProps) => {
    const { connectedNodeName } = useNodeStatus();

    const [isEditingUsername, setIsEditingUsername] = useState(false);
    const [usernameInput, setUsernameInput] = useState(username);

    const handleUsernameSubmit = () => {
        const trimmed = usernameInput.trim();
        if (trimmed && trimmed.length >= 2 && trimmed.length <= 20) {
            setUsername(trimmed);
            setIsEditingUsername(false);
        }
    };

    const handleUsernameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleUsernameSubmit();
        } else if (e.key === "Escape") {
            setUsernameInput(username);
            setIsEditingUsername(false);
        }
    };

    return (
        <header className="flex justify-between items-center px-6 py-4 bg-zinc-900 border-b border-zinc-800">
            <a href="/">
                <h1 className="text-2xl font-bold">🎬 Watch Together</h1>
            </a>
            <div className="flex items-center gap-4">
                <NodeStatusTooltip />
                {connectedNodeName ? (
                    <span className="text-sm text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-full">
                        ● {connectedNodeName}
                    </span>
                ) : (
                    <span className="text-sm text-red-400 bg-red-400/10 px-3 py-1.5 rounded-full">
                        ● Disconnected
                    </span>
                )}
                {isEditingUsername ? (
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={usernameInput}
                            onChange={(e) => setUsernameInput(e.target.value)}
                            onKeyDown={handleUsernameKeyDown}
                            onBlur={handleUsernameSubmit}
                            maxLength={20}
                            autoFocus
                            className="text-sm bg-zinc-800 border border-blue-500 text-white px-3 py-1.5 rounded-full outline-none w-32"
                        />
                    </div>
                ) : (
                    <button
                        onClick={() => {
                            setUsernameInput(username);
                            setIsEditingUsername(true);
                        }}
                        className="text-sm text-zinc-300 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-full transition-colors cursor-pointer"
                        title="Click to edit username"
                    >
                        {username}
                        <Pencil className="inline ml-2 w-4 h-4" />
                    </button>
                )}
            </div>
        </header>
    );
};
