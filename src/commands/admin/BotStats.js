import { SlashCommandBuilder, EmbedBuilder } from "discord.js"

export default {
  data: new SlashCommandBuilder()
    .setName("botstats")
    .setDescription("Display comprehensive bot statistics and system metrics")
    .addStringOption(option =>
      option.setName("type")
        .setDescription("Type of stats to display")
        .setRequired(false)
        .addChoices(
          { name: "Overview", value: "overview" },
          { name: "Errors", value: "errors" },
          { name: "Performance", value: "performance" },
          { name: "Memory", value: "memory" }
        )
    ),

  /**
   * @param {import('discord.js').CommandInteraction} interaction
   * @param {import('../../lib/BotClient.js').default} client
   */
  async execute(interaction, client) {
    try {
      const type = interaction.options.getString("type") || "overview"
      const metrics = client.getSystemMetrics()

      let embed

      switch (type) {
        case "overview":
          embed = createOverviewEmbed(metrics, client)
          break
        case "errors":
          embed = createErrorEmbed(metrics.errors)
          break
        case "performance":
          embed = createPerformanceEmbed(metrics)
          break
        case "memory":
          embed = createMemoryEmbed(metrics.memory)
          break
        default:
          embed = createOverviewEmbed(metrics, client)
      }

      await interaction.reply({ embeds: [embed], ephemeral: true })

    } catch (error) {
      client.error("Error in botstats command:", error)
      await client.trackError(error, {
        commandName: "botstats",
        userId: interaction.user.id,
        guildId: interaction.guildId
      })

      if (!interaction.replied) {
        await interaction.reply({
          content: "❌ An error occurred while fetching bot statistics.",
          ephemeral: true
        })
      }
    }
  },
}

function createOverviewEmbed(metrics, client) {
  const uptime = client.uptime ? Math.floor(client.uptime / 1000) : 0
  const uptimeString = formatUptime(uptime)

  return new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle("🤖 Bot Statistics - Overview")
    .addFields(
      { name: "📊 General Stats", value: `
        **Guilds:** ${metrics.guilds}
        **Users:** ${metrics.users}
        **Channels:** ${metrics.channels}
        **Uptime:** ${uptimeString}
        **Ping:** ${metrics.ping}ms
      `, inline: true },
      { name: "📈 Error Stats", value: `
        **Total Errors:** ${metrics.errors.totalCriticalErrors}
        **Error Patterns:** ${metrics.errors.uniqueErrorPatterns}
        **Last Hour:** ${metrics.errors.recentTrends.lastHour}
        **Last 24h:** ${metrics.errors.recentTrends.last24Hours}
      `, inline: true },
      { name: "💾 Memory Usage", value: `
        **RSS:** ${Math.round(metrics.memory.rss / 1024 / 1024)}MB
        **Heap Used:** ${Math.round(metrics.memory.heapUsed / 1024 / 1024)}MB
        **Heap Total:** ${Math.round(metrics.memory.heapTotal / 1024 / 1024)}MB
        **External:** ${Math.round(metrics.memory.external / 1024 / 1024)}MB
      `, inline: true },
      { name: "🔧 System Info", value: `
        **Node.js:** ${metrics.nodeVersion}
        **Discord.js:** ${metrics.discordJsVersion}
        **PID:** ${process.pid}
        **Platform:** ${process.platform}
      `, inline: false }
    )
    .setTimestamp()
    .setFooter({ text: "Bot Statistics" })
}

function createErrorEmbed(errorStats) {
  const mostCommon = errorStats.mostCommon.slice(0, 5)
  const recentTrends = errorStats.recentTrends

  let mostCommonStr = "No errors recorded"
  if (mostCommon.length > 0) {
    mostCommonStr = mostCommon
      .map((error, index) => `${index + 1}. **${error.pattern.split(':')[0]}** (${error.count}x)`)
      .join('\n')
  }

  return new EmbedBuilder()
    .setColor(0xFF6B6B)
    .setTitle("❌ Bot Statistics - Error Analysis")
    .addFields(
      { name: "📊 Error Summary", value: `
        **Total Critical Errors:** ${errorStats.totalCriticalErrors}
        **Unique Error Patterns:** ${errorStats.uniqueErrorPatterns}
        **Average per Hour:** ${recentTrends.averagePerHour}
      `, inline: true },
      { name: "⏰ Recent Activity", value: `
        **Last Hour:** ${recentTrends.lastHour} errors
        **Last 24 Hours:** ${recentTrends.last24Hours} errors
        **Current Period:** ${Object.values(errorStats.currentErrorCounts).reduce((a, b) => a + b, 0)} errors
      `, inline: true },
      { name: "🔍 Most Common Errors", value: mostCommonStr, inline: false }
    )
    .setTimestamp()
    .setFooter({ text: "Error Statistics" })
}

function createPerformanceEmbed(metrics) {
  const logCounts = metrics.info + metrics.warnings + metrics.errors + metrics.debug

  let performanceStr = "No performance data available"
  if (metrics.performance && Object.keys(metrics.performance).length > 0) {
    performanceStr = Object.entries(metrics.performance)
      .slice(0, 5)
      .map(([label, data]) => `**${label}:** ${data.duration?.toFixed(2)}ms`)
      .join('\n')
  }

  return new EmbedBuilder()
    .setColor(0x3498DB)
    .setTitle("⚡ Bot Statistics - Performance")
    .addFields(
      { name: "📈 Logging Activity", value: `
        **Total Logs:** ${logCounts}
        **Info:** ${metrics.info}
        **Warnings:** ${metrics.warnings}
        **Errors:** ${metrics.errors}
        **Debug:** ${metrics.debug}
      `, inline: true },
      { name: "⏱️ Recent Timings", value: performanceStr, inline: true },
      { name: "🔄 System Load", value: `
        **Uptime:** ${Math.floor(metrics.uptime / 1000)}s
        **Last Error:** ${metrics.lastErrorTime ? new Date(metrics.lastErrorTime).toLocaleString() : 'None'}
        **Start Time:** ${new Date(metrics.startTime).toLocaleString()}
      `, inline: false }
    )
    .setTimestamp()
    .setFooter({ text: "Performance Statistics" })
}

function createMemoryEmbed(memory) {
  const totalMemory = memory.rss + memory.external
  const heapUsagePercent = ((memory.heapUsed / memory.heapTotal) * 100).toFixed(1)

  return new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle("💾 Bot Statistics - Memory Usage")
    .addFields(
      { name: "📊 Memory Breakdown", value: `
        **RSS (Total):** ${(memory.rss / 1024 / 1024).toFixed(2)}MB
        **Heap Used:** ${(memory.heapUsed / 1024 / 1024).toFixed(2)}MB
        **Heap Total:** ${(memory.heapTotal / 1024 / 1024).toFixed(2)}MB
        **External:** ${(memory.external / 1024 / 1024).toFixed(2)}MB
      `, inline: true },
      { name: "📈 Usage Metrics", value: `
        **Heap Usage:** ${heapUsagePercent}%
        **Total Memory:** ${(totalMemory / 1024 / 1024).toFixed(2)}MB
        **Array Buffers:** ${(memory.arrayBuffers / 1024 / 1024).toFixed(2)}MB
      `, inline: true },
      { name: "💡 Memory Health", value: getMemoryHealthIndicator(memory), inline: false }
    )
    .setTimestamp()
    .setFooter({ text: "Memory Statistics" })
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)

  return parts.join(' ')
}

function getMemoryHealthIndicator(memory) {
  const heapUsagePercent = (memory.heapUsed / memory.heapTotal) * 100
  const totalMB = memory.rss / 1024 / 1024

  if (heapUsagePercent > 90 || totalMB > 500) {
    return "🔴 **High Usage** - Consider monitoring for memory leaks"
  } else if (heapUsagePercent > 70 || totalMB > 300) {
    return "🟡 **Moderate Usage** - Within normal range but monitor"
  } else {
    return "🟢 **Healthy** - Memory usage is optimal"
  }
}