/**
 * Shared formatting utilities
 */

/**
 * Get a display name from a user ID (last 4 characters)
 */
export function getDisplayName(userId: string): string {
    return userId.slice(-4);
}

/**
 * Format a timestamp to a localized time string (HH:MM)
 */
export function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });
}
