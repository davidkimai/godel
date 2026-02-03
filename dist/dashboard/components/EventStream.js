"use strict";
/**
 * Event Stream Component
 *
 * Formats events for display.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatEvent = formatEvent;
function formatEvent(event) {
    const time = new Date(event.timestamp).toLocaleTimeString();
    return `[${time}] ${event.type}: ${event.message}`;
}
//# sourceMappingURL=EventStream.js.map