import { useState } from "react";
import { NodeStatusTooltip } from "./NodeStatusTooltip";
import { useNodeStatus } from "../context/NodeStatusContext";
import { Clapperboard, Pencil } from "lucide-react";
import { Sheet } from "./ui/sheet";
import { SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";
import { getStatusIcon, getStatusText, getStatusClass } from "../utils/nodeStatus";

const HamburgerIcon = ({ isOpen }: { isOpen: boolean }) => (
    <div className="w-6 h-6 flex flex-col justify-center items-center">
        <span
            className={`block h-0.5 w-5 bg-current rounded-full transition-all duration-300 ease-in-out ${
                isOpen ? "rotate-45 translate-y-1" : "-translate-y-1"
            }`}
        />
        <span
            className={`block h-0.5 w-5 bg-current rounded-full transition-all duration-300 ease-in-out ${
                isOpen ? "opacity-0" : "opacity-100"
            }`}
        />
        <span
            className={`block h-0.5 w-5 bg-current rounded-full transition-all duration-300 ease-in-out ${
                isOpen ? "-rotate-45 -translate-y-1" : "translate-y-1"
            }`}
        />
    </div>
);

interface NavigationProps {
    username: string;
    setUsername: (username: string) => void;
}

export const Navigation = ({ username, setUsername }: NavigationProps) => {
    const { connectedNodeName, nodeStatuses } = useNodeStatus();

    const [isEditingUsername, setIsEditingUsername] = useState(false);
    const [usernameInput, setUsernameInput] = useState(username);
    const [isSheetOpen, setIsSheetOpen] = useState(false);

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

    const ConnectionStatus = () =>
        connectedNodeName ? (
            <span className="text-sm text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-full">
                ● {connectedNodeName}
            </span>
        ) : (
            <span className="text-sm text-red-400 bg-red-400/10 px-3 py-1.5 rounded-full">
                ● Disconnected
            </span>
        );

    const UsernameEditor = () =>
        isEditingUsername ? (
            <div className="flex items-center gap-2">
                <input
                    type="text"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    onKeyDown={handleUsernameKeyDown}
                    onBlur={handleUsernameSubmit}
                    maxLength={20}
                    autoFocus
                    className="text-sm bg-zinc-800 border border-violet-500 text-white px-3 py-1.5 rounded-full outline-none w-32"
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
        );

    return (
        <header className="flex justify-between items-center px-4 sm:px-6 py-4 bg-zinc-900 border-b border-zinc-800">
            <a href="/" className="flex items-center justify-center">
                <Clapperboard className="inline w-6 h-6 mr-4 text-violet-500" />
                <h1 className="text-xl sm:text-2xl font-bold">Watch Together</h1>
            </a>

            {/* Desktop navigation */}
            <div className="hidden sm:flex items-center gap-4">
                <NodeStatusTooltip />
                <ConnectionStatus />
                <UsernameEditor />
            </div>

            {/* Mobile hamburger menu */}
            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetTrigger asChild>
                    <button className="sm:hidden p-2 text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors">
                        <HamburgerIcon isOpen={isSheetOpen} />
                    </button>
                </SheetTrigger>
                <SheetContent side="right" className="bg-zinc-900 border-zinc-800 text-white w-72">
                    <SheetHeader>
                        <SheetTitle className="text-white">Menu</SheetTitle>
                    </SheetHeader>
                    <div className="flex flex-col gap-6 p-4">
                        <div className="space-y-3">
                            <p className="text-xs text-zinc-400 uppercase tracking-wider">
                                Node Status
                            </p>
                            <ul className="space-y-2">
                                {nodeStatuses.map((nodeStatus, index) => (
                                    <li
                                        key={index}
                                        className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-zinc-800/50"
                                    >
                                        <div className="flex items-center gap-2">
                                            {getStatusIcon(nodeStatus.status)}
                                            <span className="text-sm text-white">
                                                {nodeStatus.node.name}
                                            </span>
                                        </div>
                                        <span
                                            className={`text-xs px-2 py-0.5 rounded-full ${getStatusClass(
                                                nodeStatus.status
                                            )}`}
                                        >
                                            {getStatusText(nodeStatus.status)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs text-zinc-400 uppercase tracking-wider">
                                Username
                            </p>
                            <UsernameEditor />
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
        </header>
    );
};
