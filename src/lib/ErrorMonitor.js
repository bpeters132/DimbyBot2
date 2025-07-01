import fs from "fs"
import path from "path"

/**
 * Error monitoring and alerting system for the Discord bot
 */
export default class ErrorMonitor {
  constructor(logger, options = {}) {
    this.logger = logger
    this.options = {
      errorThreshold: options.errorThreshold ?? 10, // Errors per minute before alerting
      criticalErrorTypes: options.criticalErrorTypes ?? [
        'DiscordAPIError',
        'UnhandledPromiseRejectionWarning',
        'TypeError',
        'ReferenceError'
      ],
      alertChannelId: options.alertChannelId ?? process.env.ALERT_CHANNEL_ID,
      enableEmailAlerts: options.enableEmailAlerts ?? false,
      emailConfig: options.emailConfig ?? {},
      errorCooldownMinutes: options.errorCooldownMinutes ?? 15,
      ...options
    }

    this.errorCounts = new Map()
    this.lastAlertTime = new Map()
    this.criticalErrors = []
    this.errorPatterns = new Map()
    
    // Start error monitoring
    this.startMonitoring()
  }

  startMonitoring() {
    // Reset error counts every minute
    setInterval(() => {
      this.errorCounts.clear()
    }, 60 * 1000)

    // Generate error reports every hour
    setInterval(() => {
      this.generateErrorReport()
    }, 60 * 60 * 1000)

    // Cleanup old critical errors every 24 hours
    setInterval(() => {
      this.cleanupOldErrors()
    }, 24 * 60 * 60 * 1000)
  }

  /**
   * Track an error and potentially send alerts
   * @param {Error} error - The error to track
   * @param {Object} context - Additional context about the error
   * @param {Object} client - Discord client for sending alerts
   */
  async trackError(error, context = {}, client = null) {
    const errorType = error.constructor.name
    const errorMessage = error.message
    const timestamp = new Date()

    // Increment error count
    const currentCount = this.errorCounts.get(errorType) || 0
    this.errorCounts.set(errorType, currentCount + 1)

    // Create error record
    const errorRecord = {
      type: errorType,
      message: errorMessage,
      stack: error.stack,
      timestamp,
      context,
      severity: this.determineSeverity(error, context),
      id: this.generateErrorId(error, context)
    }

    // Add to critical errors if severe
    if (errorRecord.severity === 'CRITICAL') {
      this.criticalErrors.push(errorRecord)
      
      // Immediate alert for critical errors
      if (client) {
        await this.sendCriticalAlert(errorRecord, client)
      }
    }

    // Track error patterns
    this.trackErrorPattern(errorRecord)

    // Check if we should send threshold alert
    if (currentCount >= this.options.errorThreshold) {
      await this.sendThresholdAlert(errorType, currentCount, client)
    }

    // Log the enhanced error
    this.logger.error(`[ErrorMonitor] ${errorType}: ${errorMessage}`, error, {
      errorId: errorRecord.id,
      severity: errorRecord.severity,
      context,
      count: currentCount + 1
    })

    return errorRecord
  }

  /**
   * Determine error severity based on type and context
   */
  determineSeverity(error, context) {
    const errorType = error.constructor.name

    // Critical errors that require immediate attention
    if (this.options.criticalErrorTypes.includes(errorType)) {
      return 'CRITICAL'
    }

    // High severity for Discord API errors
    if (errorType.includes('DiscordAPI') || errorType.includes('Discord')) {
      return 'HIGH'
    }

    // High severity for database/connection errors
    if (error.message.includes('connect') || error.message.includes('database')) {
      return 'HIGH'
    }

    // Medium severity for command errors
    if (context.commandName) {
      return 'MEDIUM'
    }

    return 'LOW'
  }

  /**
   * Generate a unique error ID for tracking
   */
  generateErrorId(error, context) {
    const hash = require('crypto')
      .createHash('md5')
      .update(error.constructor.name + error.message + JSON.stringify(context))
      .digest('hex')
    return hash.substring(0, 8)
  }

  /**
   * Track patterns in errors to identify recurring issues
   */
  trackErrorPattern(errorRecord) {
    const patternKey = `${errorRecord.type}:${errorRecord.message.substring(0, 50)}`
    
    if (!this.errorPatterns.has(patternKey)) {
      this.errorPatterns.set(patternKey, {
        count: 0,
        firstSeen: errorRecord.timestamp,
        lastSeen: errorRecord.timestamp,
        contexts: []
      })
    }

    const pattern = this.errorPatterns.get(patternKey)
    pattern.count++
    pattern.lastSeen = errorRecord.timestamp
    pattern.contexts.push(errorRecord.context)

    // Keep only the last 10 contexts to avoid memory bloat
    if (pattern.contexts.length > 10) {
      pattern.contexts = pattern.contexts.slice(-10)
    }
  }

  /**
   * Send critical error alert
   */
  async sendCriticalAlert(errorRecord, client) {
    if (!this.options.alertChannelId || !client) return

    const cooldownKey = `critical_${errorRecord.type}`
    const lastAlert = this.lastAlertTime.get(cooldownKey)
    const now = Date.now()

    // Check cooldown
    if (lastAlert && (now - lastAlert) < (this.options.errorCooldownMinutes * 60 * 1000)) {
      return
    }

    try {
      const channel = await client.channels.fetch(this.options.alertChannelId)
      if (!channel) return

      const embed = {
        color: 0xFF0000, // Red
        title: '🚨 Critical Error Alert',
        fields: [
          { name: 'Error Type', value: errorRecord.type, inline: true },
          { name: 'Severity', value: errorRecord.severity, inline: true },
          { name: 'Error ID', value: errorRecord.id, inline: true },
          { name: 'Message', value: errorRecord.message.substring(0, 1000), inline: false },
          { name: 'Timestamp', value: errorRecord.timestamp.toISOString(), inline: true }
        ],
        timestamp: new Date().toISOString()
      }

      if (errorRecord.context.guildId) {
        embed.fields.push({ name: 'Guild ID', value: errorRecord.context.guildId, inline: true })
      }

      if (errorRecord.context.commandName) {
        embed.fields.push({ name: 'Command', value: errorRecord.context.commandName, inline: true })
      }

      await channel.send({ embeds: [embed] })
      this.lastAlertTime.set(cooldownKey, now)

    } catch (alertError) {
      this.logger.error('[ErrorMonitor] Failed to send critical alert:', alertError)
    }
  }

  /**
   * Send threshold alert when too many errors occur
   */
  async sendThresholdAlert(errorType, count, client) {
    if (!this.options.alertChannelId || !client) return

    const cooldownKey = `threshold_${errorType}`
    const lastAlert = this.lastAlertTime.get(cooldownKey)
    const now = Date.now()

    // Check cooldown
    if (lastAlert && (now - lastAlert) < (this.options.errorCooldownMinutes * 60 * 1000)) {
      return
    }

    try {
      const channel = await client.channels.fetch(this.options.alertChannelId)
      if (!channel) return

      const embed = {
        color: 0xFFA500, // Orange
        title: '⚠️ Error Threshold Alert',
        description: `**${errorType}** errors have exceeded the threshold`,
        fields: [
          { name: 'Error Count', value: `${count} in the last minute`, inline: true },
          { name: 'Threshold', value: this.options.errorThreshold.toString(), inline: true },
          { name: 'Timestamp', value: new Date().toISOString(), inline: true }
        ],
        timestamp: new Date().toISOString()
      }

      await channel.send({ embeds: [embed] })
      this.lastAlertTime.set(cooldownKey, now)

    } catch (alertError) {
      this.logger.error('[ErrorMonitor] Failed to send threshold alert:', alertError)
    }
  }

  /**
   * Generate comprehensive error report
   */
  generateErrorReport() {
    const now = new Date()
    const reportData = {
      timestamp: now.toISOString(),
      summary: {
        totalCriticalErrors: this.criticalErrors.length,
        uniqueErrorTypes: this.errorPatterns.size,
        mostCommonErrors: this.getMostCommonErrors(),
        errorTrends: this.getErrorTrends()
      },
      patterns: Object.fromEntries(this.errorPatterns),
      recentCriticalErrors: this.criticalErrors.slice(-10)
    }

    // Log the report
    this.logger.logStructured('info', 'Hourly Error Report', {
      type: 'ERROR_REPORT',
      report: reportData
    })

    // Save to file
    this.saveReportToFile(reportData)

    return reportData
  }

  /**
   * Get most common error types
   */
  getMostCommonErrors(limit = 5) {
    return Array.from(this.errorPatterns.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([pattern, data]) => ({
        pattern,
        count: data.count,
        firstSeen: data.firstSeen,
        lastSeen: data.lastSeen
      }))
  }

  /**
   * Get error trends over time
   */
  getErrorTrends() {
    const now = Date.now()
    const oneHourAgo = now - (60 * 60 * 1000)
    const oneDayAgo = now - (24 * 60 * 60 * 1000)

    const recentErrors = this.criticalErrors.filter(e => 
      new Date(e.timestamp).getTime() > oneHourAgo
    ).length

    const dailyErrors = this.criticalErrors.filter(e => 
      new Date(e.timestamp).getTime() > oneDayAgo
    ).length

    return {
      lastHour: recentErrors,
      last24Hours: dailyErrors,
      averagePerHour: Math.round(dailyErrors / 24)
    }
  }

  /**
   * Save error report to file
   */
  saveReportToFile(reportData) {
    try {
      const reportsDir = path.join(process.cwd(), 'logs', 'reports')
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true })
      }

      const filename = `error-report-${new Date().toISOString().split('T')[0]}.json`
      const filepath = path.join(reportsDir, filename)

      fs.writeFileSync(filepath, JSON.stringify(reportData, null, 2))
    } catch (error) {
      this.logger.error('[ErrorMonitor] Failed to save error report:', error)
    }
  }

  /**
   * Clean up old error records to prevent memory leaks
   */
  cleanupOldErrors() {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000)
    
    // Remove old critical errors
    this.criticalErrors = this.criticalErrors.filter(error => 
      new Date(error.timestamp).getTime() > oneDayAgo
    )

    // Clean up old error patterns
    for (const [key, pattern] of this.errorPatterns.entries()) {
      if (new Date(pattern.lastSeen).getTime() < oneDayAgo) {
        this.errorPatterns.delete(key)
      }
    }

    this.logger.info('[ErrorMonitor] Cleaned up old error records')
  }

  /**
   * Get current error statistics
   */
  getStats() {
    return {
      totalCriticalErrors: this.criticalErrors.length,
      uniqueErrorPatterns: this.errorPatterns.size,
      currentErrorCounts: Object.fromEntries(this.errorCounts),
      recentTrends: this.getErrorTrends(),
      mostCommon: this.getMostCommonErrors()
    }
  }

  /**
   * Create a child monitor for specific components
   */
  createChild(context = {}) {
    const childMonitor = Object.create(this)
    childMonitor.defaultContext = context
    
    const originalTrackError = this.trackError.bind(this)
    childMonitor.trackError = (error, additionalContext = {}, client) => {
      return originalTrackError(error, { ...context, ...additionalContext }, client)
    }
    
    return childMonitor
  }
}