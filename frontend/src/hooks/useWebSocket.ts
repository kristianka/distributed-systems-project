import { useEffect, useRef, useState, useCallback } from "react";
import {
    ClientMessageType,
    RoomMessageType,
    RoomState,
    ServerMessage,
    RoomCreatedPayload,
    RoomJoinedPayload,
    RoomStateUpdatePayload,
    ErrorPayload
} from "../types";

interface UseWebSocketOptions {
    url: string;
    userId: string;
    username: string;
    onRoomCreated?: (roomCode: string, state: RoomState) => void;
    onRoomJoined?: (roomCode: string, state: RoomState) => void;
    onRoomStateUpdate?: (state: RoomState) => void;
    onError?: (error: string) => void;
    onConnected?: () => void;
    onDisconnected?: () => void;
    /** Called when connection is lost - use for triggering node failover */
    onConnectionLost?: () => void;
}

interface UseWebSocketReturn {
    isConnected: boolean;
    createRoom: () => void;
    joinRoom: (roomCode: string) => void;
    leaveRoom: (roomCode: string) => void;
    play: (roomCode: string, videoId: string, positionSeconds: number) => void;
    pause: (roomCode: string, positionSeconds: number) => void;
    seek: (roomCode: string, newPositionSeconds: number) => void;
    addToPlaylist: (roomCode: string, videoId: string, title?: string, position?: number) => void;
    removeFromPlaylist: (roomCode: string, videoId: string, position: number) => void;
    sendChatMessage: (roomCode: string, messageText: string) => void;
}

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
    const {
        url,
        userId,
        username,
        onRoomCreated,
        onRoomJoined,
        onRoomStateUpdate,
        onError,
        onConnected,
        onDisconnected,
        onConnectionLost
    } = options;

    const [isConnected, setIsConnected] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<number | null>(null);
    const hasEverConnectedRef = useRef(false);

    // Store callbacks in refs to avoid reconnection on callback changes
    const callbacksRef = useRef({
        onRoomCreated,
        onRoomJoined,
        onRoomStateUpdate,
        onError,
        onConnected,
        onDisconnected,
        onConnectionLost
    });

    // Update refs when callbacks change
    useEffect(() => {
        callbacksRef.current = {
            onRoomCreated,
            onRoomJoined,
            onRoomStateUpdate,
            onError,
            onConnected,
            onDisconnected,
            onConnectionLost
        };
    }, [
        onRoomCreated,
        onRoomJoined,
        onRoomStateUpdate,
        onError,
        onConnected,
        onDisconnected,
        onConnectionLost
    ]);

    const handleMessage = useCallback((message: ServerMessage) => {
        console.log("[WebSocket] Received:", message.type);

        switch (message.type) {
            case ClientMessageType.CONNECTED:
                console.log("[WebSocket] Server acknowledged connection");
                break;

            case ClientMessageType.ROOM_CREATED: {
                const payload = message.payload as RoomCreatedPayload;
                callbacksRef.current.onRoomCreated?.(payload.roomCode, payload.roomState);
                break;
            }

            case ClientMessageType.ROOM_JOINED: {
                const payload = message.payload as RoomJoinedPayload;
                callbacksRef.current.onRoomJoined?.(payload.roomCode, payload.roomState);
                break;
            }

            case ClientMessageType.ROOM_STATE_UPDATE: {
                const payload = message.payload as RoomStateUpdatePayload;
                callbacksRef.current.onRoomStateUpdate?.(payload.roomState);
                break;
            }

            case ClientMessageType.ERROR: {
                const payload = message.payload as ErrorPayload;
                callbacksRef.current.onError?.(payload.message);
                break;
            }

            case ClientMessageType.ROOM_LEFT:
                console.log("[WebSocket] Left room");
                break;

            case ClientMessageType.LEADER_CHANGED:
                console.log("[WebSocket] Leader changed");
                break;

            default:
                console.log("[WebSocket] Unknown message type:", message.type);
        }
    }, []);

    // Connect on mount, only reconnect if URL changes
    useEffect(() => {
        let isMounted = true;

        // Don't try to connect if URL is empty or invalid
        if (!url || !url.startsWith("ws")) {
            console.log("[WebSocket] No valid URL provided, waiting...");
            return;
        }

        // Clean up any existing connection
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        if (wsRef.current) {
            wsRef.current.onclose = null; // Prevent onclose from firing during cleanup
            wsRef.current.close();
            wsRef.current = null;
        }

        const connect = () => {
            if (!isMounted) {
                return;
            }
            if (
                wsRef.current?.readyState === WebSocket.OPEN ||
                wsRef.current?.readyState === WebSocket.CONNECTING
            ) {
                return;
            }

            console.log("[WebSocket] Connecting to", url);
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                if (!isMounted) return;
                console.log("[WebSocket] Connected");
                setIsConnected(true);
                hasEverConnectedRef.current = true;
                callbacksRef.current.onConnected?.();
            };

            ws.onclose = () => {
                if (!isMounted) return;
                console.log("[WebSocket] Disconnected");
                setIsConnected(false);
                callbacksRef.current.onDisconnected?.();

                // If we had a connection and lost it, trigger failover to find another node
                if (hasEverConnectedRef.current) {
                    console.log("[WebSocket] Connection lost, triggering failover...");
                    hasEverConnectedRef.current = false;
                    // Small delay before failover to avoid rapid retries
                    reconnectTimeoutRef.current = window.setTimeout(() => {
                        callbacksRef.current.onConnectionLost?.();
                    }, 500);
                }
            };

            ws.onerror = (error) => {
                if (!isMounted) return;
                console.error("[WebSocket] Error:", error);
                callbacksRef.current.onError?.("WebSocket connection error");
            };

            ws.onmessage = (event) => {
                if (!isMounted) return;
                try {
                    const message: ServerMessage = JSON.parse(event.data);
                    handleMessage(message);
                } catch (err) {
                    console.error("[WebSocket] Failed to parse message:", err);
                }
            };
        };

        connect();

        return () => {
            isMounted = false;
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
            if (wsRef.current) {
                wsRef.current.onclose = null; // Prevent onclose callback
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [url, handleMessage]);

    const send = useCallback((type: RoomMessageType, payload: unknown) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type, payload }));
        } else {
            console.error("[WebSocket] Not connected");
        }
    }, []);

    const createRoom = useCallback(() => {
        send(RoomMessageType.ROOM_CREATE, { userId, username });
    }, [send, userId, username]);

    const joinRoom = useCallback(
        (roomCode: string) => {
            send(RoomMessageType.ROOM_JOIN, { roomCode, userId, username });
        },
        [send, userId, username]
    );

    const leaveRoom = useCallback(
        (roomCode: string) => {
            send(RoomMessageType.ROOM_LEAVE, { roomCode, userId });
        },
        [send, userId]
    );

    const play = useCallback(
        (roomCode: string, videoId: string, positionSeconds: number) => {
            send(RoomMessageType.PLAYBACK_PLAY, { roomCode, videoId, positionSeconds });
        },
        [send]
    );

    const pause = useCallback(
        (roomCode: string, positionSeconds: number) => {
            send(RoomMessageType.PLAYBACK_PAUSE, { roomCode, positionSeconds });
        },
        [send]
    );

    const seek = useCallback(
        (roomCode: string, newPositionSeconds: number) => {
            send(RoomMessageType.PLAYBACK_SEEK, { roomCode, newPositionSeconds });
        },
        [send]
    );

    const addToPlaylist = useCallback(
        (roomCode: string, videoId: string, title?: string, position?: number) => {
            send(RoomMessageType.PLAYLIST_ADD, {
                roomCode,
                videoId,
                title,
                userId,
                username,
                newVideoPosition: position ?? -1 // -1 means append to end
            });
        },
        [send, userId, username]
    );

    const removeFromPlaylist = useCallback(
        (roomCode: string, videoId: string, position: number) => {
            send(RoomMessageType.PLAYLIST_REMOVE, {
                roomCode,
                videoId,
                removedVideoPosition: position
            });
        },
        [send]
    );

    const sendChatMessage = useCallback(
        (roomCode: string, messageText: string) => {
            send(RoomMessageType.CHAT_MESSAGE, {
                roomCode,
                userId,
                username,
                messageText,
                timestamp: Date.now()
            });
        },
        [send, userId, username]
    );

    return {
        isConnected,
        createRoom,
        joinRoom,
        leaveRoom,
        play,
        pause,
        seek,
        addToPlaylist,
        removeFromPlaylist,
        sendChatMessage
    };
}
