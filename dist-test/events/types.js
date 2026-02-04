"use strict";
/**
 * Event Types - SPEC_V3.md Part III
 * Defines all event types and their payloads
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBaseEvent = createBaseEvent;
exports.generateEventId = generateEventId;
// Helper function to create base event
function createBaseEvent(eventType, source, correlationId) {
    return {
        eventType,
        source,
        correlationId
    };
}
// Generate unique event ID
function generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
