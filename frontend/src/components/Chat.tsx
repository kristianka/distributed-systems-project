import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "../types";
import { getDisplayName, formatTime } from "../utils";

interface ChatProps {
    messages: ChatMessage[];
    currentUserId: string;
    onSendMessage: (message: string) => void;
}

export function Chat({ messages, currentUserId, onSendMessage }: ChatProps) {
    const [input, setInput] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim()) {
            onSendMessage(input.trim());
            setInput("");
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-800">
                <h3 className="font-semibold text-white">💬 Chat</h3>
                <span className="text-xs text-zinc-500">{messages.length} messages</span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-center">
                        <p>No messages yet</p>
                        <p className="text-sm text-zinc-600">Be the first to say hello! 👋</p>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`max-w-[85%] p-2.5 rounded-xl wrap-break-word ${
                                msg.userId === currentUserId
                                    ? "ml-auto bg-blue-600 text-white rounded-br-sm"
                                    : "mr-auto bg-zinc-800 text-white rounded-bl-sm"
                            }`}
                        >
                            <div
                                className={`flex justify-between items-center gap-2 text-xs mb-1 ${
                                    msg.userId === currentUserId ? "text-blue-200" : "text-zinc-400"
                                }`}
                            >
                                <span className="font-semibold">
                                    {msg.userId === currentUserId
                                        ? "You"
                                        : getDisplayName(msg.userId)}
                                </span>
                                <span className="text-[10px]">{formatTime(msg.timestamp)}</span>
                            </div>
                            <div className="text-sm leading-relaxed">{msg.messageText}</div>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form className="flex gap-2 p-3 border-t border-zinc-800" onSubmit={handleSubmit}>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type a message..."
                    maxLength={500}
                    className="flex-1 bg-zinc-800 border border-zinc-700 focus:border-blue-500 text-white py-2 px-3 rounded-full text-sm outline-none transition-colors placeholder:text-zinc-500"
                />
                <button
                    type="submit"
                    disabled={!input.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-full text-sm transition-colors"
                >
                    Send
                </button>
            </form>
        </div>
    );
}
