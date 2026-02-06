/**
 * @fileoverview Inter-Agent Communication System
 * 
 * Message passing infrastructure for agent-to-agent communication.
 * Provides AgentMailbox for individual agents and InterAgentBus for
 * system-wide message routing, supporting directed messages, broadcasts,
 * and role-based messaging.
 * 
 * @module core/roles/inter-agent-comm
 * @version 1.0.0
 * @license MIT
 */

import { EventEmitter } from 'events'
import { MessageFilter, StorageAdapter } from './types.js'

/**
 * Message types for inter-agent communication.
 */
export type MessageType =
  /** Task assignment or delegation */
  | 'task'
  /** Status update */
  | 'status'
  /** Task completion result */
  | 'result'
  /** Alert or warning */
  | 'alert'
  /** Query or request for information */
  | 'query'
  /** Feedback or review comments */
  | 'feedback'
  /** General message */
  | 'message'
  /** System notification */
  | 'system'
  /** Error notification */
  | 'error'

/**
 * Message priority levels.
 */
export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent'

/**
 * Agent message structure.
 * 
 * Messages are the primary mechanism for inter-agent communication.
 * They support various types (task, status, alert, etc.) with
 * priority levels and optional payloads.
 * 
 * @example
 * ```typescript
 * const message: AgentMessage = {
 *   id: 'msg-123',
 *   from: 'coordinator-1',
 *   to: 'worker-1',
 *   role: 'coordinator',
 *   type: 'task',
 *   content: 'Implement user authentication',
 *   payload: { taskId: 'task-456', priority: 'high' },
 *   timestamp: new Date(),
 *   priority: 'high'
 * };
 * ```
 */
export interface AgentMessage {
  /** Unique message identifier */
  id: string
  /** Sender agent ID */
  from: string
  /** Recipient agent ID or 'broadcast' for all agents */
  to: string
  /** Role of the sender */
  role: string
  /** Message type */
  type: MessageType
  /** Message content (plain text or markdown) */
  content: string
  /** Optional structured payload */
  payload?: unknown
  /** Timestamp when the message was created */
  timestamp: Date
  /** Message priority level */
  priority: MessagePriority
  /** Whether the message has been read */
  read?: boolean
  /** Timestamp when the message was read */
  readAt?: Date
  /** Reply-to message ID for threaded conversations */
  replyTo?: string
  /** Thread ID for grouping related messages */
  threadId?: string
  /** Expiration time for time-sensitive messages */
  expiresAt?: Date
}

/**
 * Message delivery status.
 */
export interface DeliveryStatus {
  /** Message ID */
  messageId: string
  /** Delivery state */
  status: 'pending' | 'delivered' | 'read' | 'failed'
  /** Timestamp of last status update */
  timestamp: Date
  /** Error message if delivery failed */
  error?: string
  /** Number of delivery attempts */
  attempts: number
}

/**
 * Message statistics for an agent.
 */
export interface MailboxStatistics {
  /** Total messages received */
  totalReceived: number
  /** Total messages sent */
  totalSent: number
  /** Number of unread messages */
  unreadCount: number
  /** Number of high/urgent priority messages */
  urgentCount: number
  /** Messages by type */
  byType: Record<MessageType, number>
  /** Last activity timestamp */
  lastActivityAt?: Date
}

/**
 * Options for creating an AgentMailbox.
 */
export interface AgentMailboxOptions {
  /** Agent ID for this mailbox */
  agentId: string
  /** Storage adapter for persistence */
  storage: StorageAdapter
  /** Maximum number of messages to retain */
  maxMessages?: number
  /** Storage key prefix */
  storagePrefix?: string
}

/**
 * Individual agent mailbox for receiving and managing messages.
 * 
 * Each agent has its own mailbox that stores received messages,
 * tracks read status, and emits events for new messages.
 * 
 * @example
 * ```typescript
 * const mailbox = new AgentMailbox({ agentId: 'worker-1', storage: adapter });
 * await mailbox.initialize();
 * 
 * // Receive new messages
 * mailbox.on('message', (msg) => console.log('New message:', msg.content));
 * 
 * // Get unread messages
 * const unread = await mailbox.receive({ read: false });
 * 
 * // Mark as read
 * await mailbox.markRead(msg.id);
 * ```
 */
export class AgentMailbox extends EventEmitter {
  private agentId: string
  private messages: Map<string, AgentMessage>
  private unreadCount: number
  private storage: StorageAdapter
  private storagePrefix: string
  private maxMessages: number
  private initialized: boolean
  private stats: MailboxStatistics

  /**
   * Create a new AgentMailbox.
   * 
   * @param options - Mailbox configuration
   */
  constructor(options: AgentMailboxOptions) {
    super()
    this.agentId = options.agentId
    this.messages = new Map()
    this.unreadCount = 0
    this.storage = options.storage
    this.storagePrefix = options.storagePrefix ?? `mailbox:${options.agentId}:`
    this.maxMessages = options.maxMessages ?? 1000
    this.initialized = false
    this.stats = {
      totalReceived: 0,
      totalSent: 0,
      unreadCount: 0,
      urgentCount: 0,
      byType: {
        task: 0,
        status: 0,
        result: 0,
        alert: 0,
        query: 0,
        feedback: 0,
        message: 0,
        system: 0,
        error: 0
      }
    }
  }

  /**
   * Initialize the mailbox by loading persisted messages.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      // Load messages from storage
      const messageKeys = await this.storage.list(this.storagePrefix)
      for (const key of messageKeys) {
        if (key.includes(':stats')) continue

        const msg = await this.storage.get<AgentMessage>(key)
        if (msg) {
          const messageId = key.replace(this.storagePrefix, '')
          this.messages.set(messageId, {
            ...msg,
            timestamp: new Date(msg.timestamp),
            readAt: msg.readAt ? new Date(msg.readAt) : undefined,
            expiresAt: msg.expiresAt ? new Date(msg.expiresAt) : undefined
          })
          if (!msg.read) {
            this.unreadCount++
          }
        }
      }

      // Load stats
      const savedStats = await this.storage.get<MailboxStatistics>(`${this.storagePrefix}stats`)
      if (savedStats) {
        this.stats = savedStats
      }

      this.initialized = true
      this.emit('initialized', { messageCount: this.messages.size })
    } catch (error) {
      this.emit('error', { operation: 'initialize', error })
      throw error
    }
  }

  /**
   * Ensure the mailbox is initialized.
   * @private
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('AgentMailbox not initialized. Call initialize() first.')
    }
  }

  /**
   * Deliver a message to this mailbox.
   * 
   * @param message - The message to deliver
   * @emits 'message' when a new message arrives
   * @emits 'urgent' when an urgent/high priority message arrives
   */
  async deliver(message: AgentMessage): Promise<void> {
    this.ensureInitialized()

    // Check for expiration
    if (message.expiresAt && message.expiresAt < new Date()) {
      return // Message expired, don't deliver
    }

    // Store message
    this.messages.set(message.id, message)
    await this.storage.set(`${this.storagePrefix}${message.id}`, message)

    // Update stats
    this.stats.totalReceived++
    this.stats.byType[message.type]++
    this.stats.lastActivityAt = new Date()

    if (!message.read) {
      this.unreadCount++
      this.stats.unreadCount = this.unreadCount
    }

    if (message.priority === 'high' || message.priority === 'urgent') {
      this.stats.urgentCount++
    }

    await this.saveStats()

    // Enforce max messages limit
    if (this.messages.size > this.maxMessages) {
      await this.trimOldestMessages()
    }

    // Emit events
    this.emit('message', message)

    if (message.priority === 'urgent') {
      this.emit('urgent', message)
    }

    if (message.type === 'alert') {
      this.emit('alert', message)
    }
  }

  /**
   * Send a message from this agent.
   * 
   * @param message - Message data (without id and timestamp)
   * @returns The sent message
   */
  async send(
    message: Omit<AgentMessage, 'id' | 'timestamp' | 'from'>
  ): Promise<AgentMessage> {
    this.ensureInitialized()

    const fullMessage: AgentMessage = {
      ...message,
      id: this.generateMessageId(),
      from: this.agentId,
      timestamp: new Date()
    }

    // Update sent stats
    this.stats.totalSent++
    this.stats.lastActivityAt = new Date()
    await this.saveStats()

    this.emit('sent', fullMessage)

    return fullMessage
  }

  /**
   * Receive messages from the mailbox.
   * 
   * @param filter - Optional filter criteria
   * @returns Array of matching messages
   * 
   * @example
   * ```typescript
   * // Get all unread messages
   * const unread = await mailbox.receive({ read: false });
   * 
   * // Get high priority alerts
   * const alerts = await mailbox.receive({ 
   *   type: 'alert', 
   *   priority: 'high' 
   * });
   * ```
   */
  async receive(filter?: MessageFilter): Promise<AgentMessage[]> {
    this.ensureInitialized()

    let messages = Array.from(this.messages.values())

    // Apply filters
    if (filter) {
      if (filter.type) {
        messages = messages.filter(m => m.type === filter.type)
      }
      if (filter.fromRole) {
        messages = messages.filter(m => m.role === filter.fromRole)
      }
      if (filter.priority) {
        messages = messages.filter(m => m.priority === filter.priority)
      }
      if (filter.read !== undefined) {
        messages = messages.filter(m => !!m.read === filter.read)
      }
      if (filter.after) {
        messages = messages.filter(m => m.timestamp > filter.after!)
      }
      if (filter.before) {
        messages = messages.filter(m => m.timestamp < filter.before!)
      }
    }

    // Sort by timestamp (newest first)
    messages.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    // Apply limit
    if (filter?.limit) {
      messages = messages.slice(0, filter.limit)
    }

    return messages
  }

  /**
   * Get a specific message by ID.
   * 
   * @param messageId - The message identifier
   * @returns The message or undefined
   */
  getMessage(messageId: string): AgentMessage | undefined {
    this.ensureInitialized()
    return this.messages.get(messageId)
  }

  /**
   * Mark a message as read.
   * 
   * @param messageId - The message to mark
   */
  async markRead(messageId: string): Promise<void> {
    this.ensureInitialized()

    const message = this.messages.get(messageId)
    if (!message) {
      return
    }

    if (!message.read) {
      message.read = true
      message.readAt = new Date()
      this.unreadCount = Math.max(0, this.unreadCount - 1)
      this.stats.unreadCount = this.unreadCount

      await this.storage.set(`${this.storagePrefix}${messageId}`, message)
      await this.saveStats()

      this.emit('read', message)
    }
  }

  /**
   * Mark all messages as read.
   */
  async markAllRead(): Promise<void> {
    this.ensureInitialized()

    for (const [id, message] of this.messages) {
      if (!message.read) {
        message.read = true
        message.readAt = new Date()
        await this.storage.set(`${this.storagePrefix}${id}`, message)
      }
    }

    this.unreadCount = 0
    this.stats.unreadCount = 0
    await this.saveStats()

    this.emit('all-read')
  }

  /**
   * Delete a message.
   * 
   * @param messageId - The message to delete
   */
  async deleteMessage(messageId: string): Promise<void> {
    this.ensureInitialized()

    const message = this.messages.get(messageId)
    if (message && !message.read) {
      this.unreadCount = Math.max(0, this.unreadCount - 1)
      this.stats.unreadCount = this.unreadCount
    }

    this.messages.delete(messageId)
    await this.storage.delete(`${this.storagePrefix}${messageId}`)
    await this.saveStats()

    this.emit('deleted', { messageId })
  }

  /**
   * Get the number of unread messages.
   */
  getUnreadCount(): number {
    return this.unreadCount
  }

  /**
   * Get all messages in the mailbox.
   */
  getMessages(): AgentMessage[] {
    this.ensureInitialized()
    return Array.from(this.messages.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  }

  /**
   * Get mailbox statistics.
   */
  getStatistics(): MailboxStatistics {
    return { ...this.stats }
  }

  /**
   * Get messages grouped by thread.
   */
  getThreads(): Map<string, AgentMessage[]> {
    this.ensureInitialized()

    const threads = new Map<string, AgentMessage[]>()

    for (const message of this.messages.values()) {
      const threadId = message.threadId ?? message.id
      if (!threads.has(threadId)) {
        threads.set(threadId, [])
      }
      threads.get(threadId)!.push(message)
    }

    // Sort messages within each thread
    for (const [, messages] of threads) {
      messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    }

    return threads
  }

  /**
   * Generate a unique message ID.
   * @private
   */
  private generateMessageId(): string {
    return `msg-${this.agentId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }

  /**
   * Save statistics to storage.
   * @private
   */
  private async saveStats(): Promise<void> {
    await this.storage.set(`${this.storagePrefix}stats`, this.stats)
  }

  /**
   * Trim oldest messages to enforce max limit.
   * @private
   */
  private async trimOldestMessages(): Promise<void> {
    const sorted = Array.from(this.messages.entries())
      .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime())

    const toRemove = sorted.slice(0, sorted.length - this.maxMessages)
    for (const [id, message] of toRemove) {
      if (!message.read) {
        this.unreadCount = Math.max(0, this.unreadCount - 1)
      }
      this.messages.delete(id)
      await this.storage.delete(`${this.storagePrefix}${id}`)
    }

    this.stats.unreadCount = this.unreadCount
    await this.saveStats()
  }

  /**
   * Clean up expired messages.
   * 
   * @returns Number of messages removed
   */
  async cleanupExpired(): Promise<number> {
    this.ensureInitialized()

    const now = new Date()
    let removed = 0

    for (const [id, message] of this.messages) {
      if (message.expiresAt && message.expiresAt < now) {
        if (!message.read) {
          this.unreadCount = Math.max(0, this.unreadCount - 1)
        }
        this.messages.delete(id)
        await this.storage.delete(`${this.storagePrefix}${id}`)
        removed++
      }
    }

    if (removed > 0) {
      this.stats.unreadCount = this.unreadCount
      await this.saveStats()
    }

    return removed
  }

  /**
   * Dispose of the mailbox and release resources.
   */
  async dispose(): Promise<void> {
    this.messages.clear()
    this.unreadCount = 0
    this.initialized = false
    this.removeAllListeners()
  }
}

/**
 * Options for creating an InterAgentBus.
 */
export interface InterAgentBusOptions {
  /** Storage adapter for persistence */
  storage: StorageAdapter
  /** Storage key prefix */
  storagePrefix?: string
  /** Whether to enable message delivery tracking */
  trackDelivery?: boolean
}

/**
 * System-wide message bus for inter-agent communication.
 * 
 * The InterAgentBus manages mailboxes for all agents and handles
 * message routing between them. It supports:
 * - Direct agent-to-agent messaging
 * - Broadcast to all agents
 * - Role-based messaging
 * - Delivery tracking
 * 
 * @example
 * ```typescript
 * const bus = new InterAgentBus({ storage: adapter });
 * await bus.initialize();
 * 
 * // Register agents
 * const workerMailbox = bus.registerAgent('worker-1');
 * const coordMailbox = bus.registerAgent('coordinator-1');
 * 
 * // Send direct message
 * await bus.send('coordinator-1', 'worker-1', {
 *   role: 'coordinator',
 *   type: 'task',
 *   content: 'Implement feature X',
 *   priority: 'high'
 * });
 * 
 * // Broadcast to all agents
 * await bus.broadcast('coordinator-1', {
 *   role: 'coordinator',
 *   type: 'alert',
 *   content: 'System maintenance in 5 minutes',
 *   priority: 'urgent'
 * });
 * ```
 */
export class InterAgentBus extends EventEmitter {
  private mailboxes: Map<string, AgentMailbox>
  private storage: StorageAdapter
  private storagePrefix: string
  private trackDelivery: boolean
  private deliveryStatus: Map<string, DeliveryStatus>
  private initialized: boolean

  /**
   * Create a new InterAgentBus.
   * 
   * @param options - Bus configuration
   */
  constructor(options: InterAgentBusOptions) {
    super()
    this.mailboxes = new Map()
    this.storage = options.storage
    this.storagePrefix = options.storagePrefix ?? 'bus:'
    this.trackDelivery = options.trackDelivery ?? true
    this.deliveryStatus = new Map()
    this.initialized = false
  }

  /**
   * Initialize the bus and load persisted data.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      // Load delivery status if tracking is enabled
      if (this.trackDelivery) {
        const statusKeys = await this.storage.list(`${this.storagePrefix}delivery:`)
        for (const key of statusKeys) {
          const status = await this.storage.get<DeliveryStatus>(key)
          if (status) {
            const messageId = key.replace(`${this.storagePrefix}delivery:`, '')
            this.deliveryStatus.set(messageId, {
              ...status,
              timestamp: new Date(status.timestamp)
            })
          }
        }
      }

      this.initialized = true
      this.emit('initialized', { mailboxes: this.mailboxes.size })
    } catch (error) {
      this.emit('error', { operation: 'initialize', error })
      throw error
    }
  }

  /**
   * Ensure the bus is initialized.
   * @private
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('InterAgentBus not initialized. Call initialize() first.')
    }
  }

  /**
   * Register an agent and create its mailbox.
   * 
   * @param agentId - The agent identifier
   * @returns The agent's mailbox
   */
  registerAgent(agentId: string): AgentMailbox {
    this.ensureInitialized()

    if (this.mailboxes.has(agentId)) {
      return this.mailboxes.get(agentId)!
    }

    const mailbox = new AgentMailbox({
      agentId,
      storage: this.storage,
      storagePrefix: `${this.storagePrefix}mailbox:${agentId}:`
    })

    // Forward events
    mailbox.on('message', (msg) => this.emit('message', { agentId, message: msg }))
    mailbox.on('urgent', (msg) => this.emit('urgent', { agentId, message: msg }))
    mailbox.on('alert', (msg) => this.emit('alert', { agentId, message: msg }))

    this.mailboxes.set(agentId, mailbox)
    this.emit('agent:registered', { agentId })

    return mailbox
  }

  /**
   * Unregister an agent and remove its mailbox.
   * 
   * @param agentId - The agent to unregister
   */
  async unregisterAgent(agentId: string): Promise<void> {
    this.ensureInitialized()

    const mailbox = this.mailboxes.get(agentId)
    if (mailbox) {
      await mailbox.dispose()
      this.mailboxes.delete(agentId)
      this.emit('agent:unregistered', { agentId })
    }
  }

  /**
   * Get an agent's mailbox.
   * 
   * @param agentId - The agent identifier
   * @returns The mailbox or undefined
   */
  getMailbox(agentId: string): AgentMailbox | undefined {
    this.ensureInitialized()
    return this.mailboxes.get(agentId)
  }

  /**
   * Check if an agent is registered.
   * 
   * @param agentId - The agent identifier
   * @returns True if registered
   */
  isRegistered(agentId: string): boolean {
    this.ensureInitialized()
    return this.mailboxes.has(agentId)
  }

  /**
   * Send a message from one agent to another.
   * 
   * @param from - Sender agent ID
   * @param to - Recipient agent ID
   * @param message - Message data (without id, timestamp, to, from)
   * @returns The sent message
   * @throws Error if recipient not found
   */
  async send(
    from: string,
    to: string,
    message: Omit<AgentMessage, 'id' | 'timestamp' | 'to' | 'from'>
  ): Promise<AgentMessage> {
    this.ensureInitialized()

    const senderMailbox = this.mailboxes.get(from)
    if (!senderMailbox) {
      throw new Error(`Sender not registered: ${from}`)
    }

    const recipientMailbox = this.mailboxes.get(to)
    if (!recipientMailbox) {
      throw new Error(`Recipient not registered: ${to}`)
    }

    // Create message via sender's mailbox
    const fullMessage = await senderMailbox.send({
      ...message,
      to
    })

    // Deliver to recipient
    await recipientMailbox.deliver(fullMessage)

    // Track delivery
    if (this.trackDelivery) {
      await this.trackMessageStatus(fullMessage.id, 'delivered')
    }

    this.emit('sent', { from, to, message: fullMessage })

    return fullMessage
  }

  /**
   * Broadcast a message to all registered agents.
   * 
   * @param from - Sender agent ID
   * @param message - Message data (without id, timestamp, to, from)
   * @returns The broadcast message
   */
  async broadcast(
    from: string,
    message: Omit<AgentMessage, 'id' | 'timestamp' | 'to' | 'from'>
  ): Promise<AgentMessage> {
    this.ensureInitialized()

    const senderMailbox = this.mailboxes.get(from)
    if (!senderMailbox) {
      throw new Error(`Sender not registered: ${from}`)
    }

    // Create message
    const fullMessage = await senderMailbox.send({
      ...message,
      to: 'broadcast'
    })

    // Deliver to all agents except sender
    const deliveries: Promise<void>[] = []
    for (const [agentId, mailbox] of this.mailboxes) {
      if (agentId !== from) {
        deliveries.push(mailbox.deliver(fullMessage))
      }
    }

    await Promise.all(deliveries)

    if (this.trackDelivery) {
      await this.trackMessageStatus(fullMessage.id, 'delivered')
    }

    this.emit('broadcast', { from, message: fullMessage, recipients: deliveries.length })

    return fullMessage
  }

  /**
   * Send a message to all agents with a specific role.
   * 
   * @param from - Sender agent ID
   * @param toRole - Target role ID
   * @param message - Message data
   * @param roleAssignments - Map of agent IDs to role IDs
   * @returns The sent message and delivery count
   */
  async sendToRole(
    from: string,
    toRole: string,
    message: Omit<AgentMessage, 'id' | 'timestamp' | 'to' | 'from'>,
    roleAssignments: Map<string, string>
  ): Promise<{ message: AgentMessage; deliveredCount: number }> {
    this.ensureInitialized()

    const senderMailbox = this.mailboxes.get(from)
    if (!senderMailbox) {
      throw new Error(`Sender not registered: ${from}`)
    }

    // Create message
    const fullMessage = await senderMailbox.send({
      ...message,
      to: `role:${toRole}`
    })

    // Deliver to agents with matching role
    let deliveredCount = 0
    const deliveries: Promise<void>[] = []

    for (const [agentId, roleId] of roleAssignments) {
      if (roleId === toRole) {
        const mailbox = this.mailboxes.get(agentId)
        if (mailbox) {
          deliveries.push(mailbox.deliver(fullMessage))
          deliveredCount++
        }
      }
    }

    await Promise.all(deliveries)

    if (this.trackDelivery) {
      await this.trackMessageStatus(fullMessage.id, 'delivered')
    }

    this.emit('role-message', { from, toRole, message: fullMessage, deliveredCount })

    return { message: fullMessage, deliveredCount }
  }

  /**
   * Track message delivery status.
   * @private
   */
  private async trackMessageStatus(
    messageId: string,
    status: DeliveryStatus['status']
  ): Promise<void> {
    const deliveryStatus: DeliveryStatus = {
      messageId,
      status,
      timestamp: new Date(),
      attempts: 1
    }

    this.deliveryStatus.set(messageId, deliveryStatus)
    await this.storage.set(
      `${this.storagePrefix}delivery:${messageId}`,
      deliveryStatus
    )
  }

  /**
   * Get delivery status for a message.
   * 
   * @param messageId - The message identifier
   * @returns Delivery status or undefined
   */
  getDeliveryStatus(messageId: string): DeliveryStatus | undefined {
    this.ensureInitialized()
    return this.deliveryStatus.get(messageId)
  }

  /**
   * Mark a message as read by a recipient.
   * 
   * @param messageId - The message identifier
   * @param recipientId - The agent who read the message
   */
  async markDeliveredAsRead(messageId: string, recipientId: string): Promise<void> {
    this.ensureInitialized()

    const mailbox = this.mailboxes.get(recipientId)
    if (mailbox) {
      await mailbox.markRead(messageId)
    }

    if (this.trackDelivery) {
      const status = this.deliveryStatus.get(messageId)
      if (status) {
        status.status = 'read'
        status.timestamp = new Date()
        await this.storage.set(
          `${this.storagePrefix}delivery:${messageId}`,
          status
        )
      }
    }
  }

  /**
   * Get all registered agent IDs.
   */
  getRegisteredAgents(): string[] {
    this.ensureInitialized()
    return Array.from(this.mailboxes.keys())
  }

  /**
   * Get message statistics across all mailboxes.
   */
  getGlobalStatistics(): {
    totalAgents: number
    totalMessages: number
    totalUnread: number
    totalUrgent: number
  } {
    this.ensureInitialized()

    let totalMessages = 0
    let totalUnread = 0
    let totalUrgent = 0

    for (const mailbox of this.mailboxes.values()) {
      const stats = mailbox.getStatistics()
      totalMessages += stats.totalReceived
      totalUnread += stats.unreadCount
      totalUrgent += stats.urgentCount
    }

    return {
      totalAgents: this.mailboxes.size,
      totalMessages,
      totalUnread,
      totalUrgent
    }
  }

  /**
   * Clean up expired messages across all mailboxes.
   * 
   * @returns Total number of messages removed
   */
  async cleanupExpiredMessages(): Promise<number> {
    this.ensureInitialized()

    let totalRemoved = 0
    for (const mailbox of this.mailboxes.values()) {
      totalRemoved += await mailbox.cleanupExpired()
    }

    return totalRemoved
  }

  /**
   * Dispose of the bus and all mailboxes.
   */
  async dispose(): Promise<void> {
    for (const mailbox of this.mailboxes.values()) {
      await mailbox.dispose()
    }
    this.mailboxes.clear()
    this.deliveryStatus.clear()
    this.initialized = false
    this.removeAllListeners()
  }
}
