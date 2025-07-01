# Enhanced Logging and Admin Features

This document outlines the enhanced logging, error monitoring, and admin web portal features that have been added to the Discord bot.

## 🚀 Overview

The bot now includes:

- **Enhanced Logging System** - Comprehensive logging with metrics, performance tracking, and structured output
- **Advanced Error Monitoring** - Real-time error tracking, alerting, and pattern analysis
- **Admin Web Portal** - Full-featured web interface for bot management and monitoring
- **Real-time Metrics** - Live system metrics and performance monitoring
- **Error Reporting** - Detailed error reports and analytics

## 📊 Enhanced Logging System

### Features

- **Multi-level Logging**: Error, Warning, Info, Debug levels
- **File Rotation**: Automatic log file rotation to prevent disk space issues
- **Structured Logging**: JSON-formatted logs for better parsing and analysis
- **Performance Tracking**: Built-in timing and performance metrics
- **Memory Monitoring**: Automatic memory usage tracking
- **Metrics Collection**: Comprehensive system and application metrics

### Configuration

```bash
# Environment Variables
LOG_LEVEL=info          # Set logging level (error, warn, info, debug)
NODE_ENV=production     # Production mode disables console logging
```

### Usage Examples

```javascript
// Basic logging
client.info("Bot started successfully")
client.warn("High memory usage detected")
client.error("Failed to connect to database", error)
client.debug("Processing command", { commandName: "ping" })

// Performance tracking
client.logger.time("command_execution")
// ... command execution ...
const duration = client.logger.timeEnd("command_execution")

// Structured logging
client.logger.logStructured('info', 'User joined', {
  userId: user.id,
  guildId: guild.id,
  timestamp: new Date().toISOString()
})

// Get metrics
const metrics = client.logger.getMetrics()
console.log(`Uptime: ${metrics.uptime}ms`)
```

### Log Files

- `logs/app.log` - Main application log
- `logs/app-errors.log` - Error-only log
- `logs/app-exceptions.log` - Uncaught exceptions
- `logs/app-rejections.log` - Unhandled promise rejections
- `logs/reports/error-report-YYYY-MM-DD.json` - Daily error reports

## 🔍 Error Monitoring System

### Features

- **Real-time Error Tracking**: Automatic error detection and logging
- **Error Pattern Analysis**: Identifies recurring error patterns
- **Alert System**: Discord notifications for critical errors
- **Error Rate Monitoring**: Tracks error frequency and trends
- **Comprehensive Reports**: Detailed error analytics and reports

### Configuration

```bash
# Environment Variables
ALERT_CHANNEL_ID=123456789      # Discord channel for error alerts
ERROR_THRESHOLD=10              # Errors per minute before alerting
ERROR_COOLDOWN_MINUTES=15       # Cooldown between alerts
```

### Error Severity Levels

- **CRITICAL**: Immediate attention required (API errors, crashes)
- **HIGH**: Significant issues (Discord API errors, connection problems)
- **MEDIUM**: Command-related errors
- **LOW**: Minor issues

### Usage Examples

```javascript
// Track errors with context
try {
  await riskyOperation()
} catch (error) {
  await client.trackError(error, {
    userId: interaction.user.id,
    guildId: interaction.guildId,
    commandName: 'risky-command'
  })
}

// Get error statistics
const errorStats = client.getErrorStats()
console.log(`Critical errors: ${errorStats.totalCriticalErrors}`)

// Generate error report
const report = client.errorMonitor.generateErrorReport()
```

## 🌐 Admin Web Portal

### Features

- **Real-time Dashboard**: Live system metrics and statistics
- **Discord OAuth2 Authentication**: Secure admin access
- **Bot Management**: Start/stop, reload commands, change status
- **Error Analytics**: Visual error tracking and reports
- **Guild Management**: View and manage connected servers
- **Live Updates**: WebSocket-powered real-time updates
- **Mobile Responsive**: Works on desktop and mobile devices

### Setup

1. **Create Discord Application**:
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create new application or use existing bot application
   - Copy Client ID and Client Secret

2. **Configure OAuth2**:
   - In Discord app settings, go to OAuth2 > Redirects
   - Add redirect URL: `http://localhost:3000/auth/discord/callback`
   - For production, use your domain: `https://yourdomain.com/auth/discord/callback`

3. **Set Environment Variables**:
   ```bash
   ENABLE_ADMIN_SERVER=true
   ADMIN_PORT=3000
   SESSION_SECRET=your_secure_random_string_here
   DISCORD_CLIENT_ID=your_discord_app_client_id
   DISCORD_CLIENT_SECRET=your_discord_app_client_secret
   ADMIN_USER_IDS=your_discord_user_id,friend_user_id
   ```

4. **Install Dependencies**:
   ```bash
   npm install express express-session passport passport-discord express-rate-limit ws
   ```

### Admin Portal Features

#### Dashboard
- **System Overview**: Uptime, ping, guild/user counts
- **Memory Usage**: Real-time memory monitoring with charts
- **Error Statistics**: Error counts, trends, and patterns
- **Performance Metrics**: Log counts, timing data

#### Bot Controls
- **Restart Bot**: Graceful bot restart
- **Reload Commands**: Hot-reload slash commands
- **Change Status**: Update bot status and activity
- **View Guilds**: List all connected Discord servers

#### Error Management
- **Error Analytics**: Visual error tracking
- **Download Reports**: Export detailed error reports
- **Real-time Alerts**: Live error notifications

#### Live Monitoring
- **WebSocket Updates**: Real-time data updates every 5 seconds
- **Live Logs**: Stream of system events and updates
- **Interactive Charts**: Memory and performance visualizations

### Security

- **Discord OAuth2**: Secure authentication via Discord
- **Rate Limiting**: Protection against abuse
- **Admin-only Access**: Restricted to configured user IDs
- **Session Management**: Secure session handling
- **HTTPS Support**: Production-ready SSL support

### Accessing the Admin Portal

1. Start the bot with admin server enabled
2. Navigate to `http://localhost:3000` (or your configured port)
3. Click "Login with Discord"
4. Authorize the application
5. Access the dashboard (only if your user ID is in `ADMIN_USER_IDS`)

## 📈 New Admin Commands

### `/botstats`

Comprehensive bot statistics command for Discord.

**Usage**: `/botstats [type]`

**Options**:
- `overview` - General system overview (default)
- `errors` - Error analysis and statistics
- `performance` - Performance metrics and timings
- `memory` - Memory usage breakdown

**Examples**:
```
/botstats
/botstats type:errors
/botstats type:memory
```

## 🛠 Installation and Setup

### 1. Install New Dependencies

```bash
npm install express express-session passport passport-discord express-rate-limit ws
```

### 2. Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Core Settings
BOT_TOKEN=your_bot_token
LOG_LEVEL=info

# Admin Server
ENABLE_ADMIN_SERVER=true
ADMIN_PORT=3000
SESSION_SECRET=your_secure_session_secret

# Discord OAuth2
DISCORD_CLIENT_ID=your_app_client_id
DISCORD_CLIENT_SECRET=your_app_client_secret
ADMIN_USER_IDS=your_user_id,admin2_user_id

# Error Monitoring
ALERT_CHANNEL_ID=error_channel_id
ERROR_THRESHOLD=10
ERROR_COOLDOWN_MINUTES=15
```

### 3. Discord Application Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your bot application
3. In OAuth2 settings, add redirect URL:
   - Development: `http://localhost:3000/auth/discord/callback`
   - Production: `https://yourdomain.com/auth/discord/callback`
4. Copy Client ID and Client Secret to environment variables

### 4. Get Your Discord User ID

1. Enable Developer Mode in Discord (User Settings > Advanced > Developer Mode)
2. Right-click your username and select "Copy ID"
3. Add your ID to `ADMIN_USER_IDS` in environment variables

### 5. Start the Bot

```bash
npm start
```

The admin portal will be available at `http://localhost:3000`

## 📝 Usage Examples

### Basic Error Tracking

```javascript
// In a command file
try {
  await someRiskyOperation()
} catch (error) {
  // This will automatically track the error, send alerts if needed,
  // and include it in error reports
  await client.trackError(error, {
    commandName: interaction.commandName,
    userId: interaction.user.id,
    guildId: interaction.guildId
  })
  
  // Handle the error gracefully
  await interaction.reply("Something went wrong, but it's been logged!")
}
```

### Performance Monitoring

```javascript
// Track command execution time
client.logger.time(`command_${commandName}`)
try {
  await executeCommand()
  const duration = client.logger.timeEnd(`command_${commandName}`)
  client.info(`Command ${commandName} executed in ${duration}ms`)
} catch (error) {
  client.logger.timeEnd(`command_${commandName}`)
  await client.trackError(error)
}
```

### Custom Metrics

```javascript
// Log structured data for analytics
client.logger.logStructured('info', 'User Activity', {
  type: 'COMMAND_USAGE',
  commandName: 'ping',
  userId: user.id,
  guildId: guild.id,
  timestamp: new Date().toISOString(),
  responseTime: 150
})
```

## 🔧 Advanced Configuration

### Custom Error Monitoring

```javascript
// Create custom error monitor for specific components
const musicErrorMonitor = client.errorMonitor.createChild({
  component: 'music_system',
  feature: 'lavalink'
})

// Track errors with automatic context
await musicErrorMonitor.trackError(error, { songUrl, guildId })
```

### Logger Configuration

```javascript
// Create logger with custom options
const logger = new Logger('/path/to/logfile.log', {
  enableFileRotation: true,
  maxFileSize: 100 * 1024 * 1024, // 100MB
  maxFiles: 20,
  enableMetrics: true,
  enableErrorTracking: true
})
```

### Admin Server Customization

```javascript
// Start admin server with custom configuration
const adminServer = new AdminServer(client, logger, {
  port: 8080,
  enableAuth: true,
  sessionSecret: 'custom-secret',
  adminUserIds: ['123456789', '987654321'],
  errorThreshold: 5,
  errorCooldownMinutes: 10
})
```

## 🚀 Production Deployment

### Environment Variables for Production

```bash
NODE_ENV=production
ENABLE_ADMIN_SERVER=true
ADMIN_PORT=3000
SESSION_SECRET=very_secure_random_string_here
DISCORD_CLIENT_ID=your_production_client_id
DISCORD_CLIENT_SECRET=your_production_client_secret
ADMIN_USER_IDS=admin1_id,admin2_id
LOG_LEVEL=info
ERROR_THRESHOLD=5
ALERT_CHANNEL_ID=production_alerts_channel
```

### Security Considerations

1. **Use HTTPS**: Always use HTTPS in production
2. **Secure Sessions**: Use a strong, random session secret
3. **Restrict Admin Access**: Only add trusted user IDs to `ADMIN_USER_IDS`
4. **Environment Variables**: Never commit sensitive data to version control
5. **Rate Limiting**: The admin server includes built-in rate limiting
6. **Firewall**: Consider restricting admin portal access by IP

### Process Management

Consider using PM2 or similar for production:

```bash
pm2 start src/index.js --name discord-bot
pm2 logs discord-bot
pm2 restart discord-bot
```

## 🐛 Troubleshooting

### Common Issues

1. **Admin Portal Not Loading**
   - Check `ENABLE_ADMIN_SERVER=true` in environment
   - Verify port is not in use
   - Check Discord OAuth2 redirect URL

2. **Authentication Failing**
   - Verify Discord Client ID/Secret are correct
   - Check OAuth2 redirect URL matches exactly
   - Ensure your user ID is in `ADMIN_USER_IDS`

3. **Errors Not Being Tracked**
   - Check `ALERT_CHANNEL_ID` is set and bot has access
   - Verify error monitoring is enabled in logger options
   - Check bot has permission to send messages in alert channel

4. **High Memory Usage**
   - Monitor memory metrics in admin portal
   - Check for memory leaks in custom code
   - Consider adjusting log file rotation settings

### Debug Mode

Enable debug logging to troubleshoot:

```bash
LOG_LEVEL=debug
```

This will provide detailed information about bot operations, including admin server requests and error tracking.

## 🤝 Contributing

When adding new features:

1. **Use Error Tracking**: Always wrap risky operations with error tracking
2. **Add Logging**: Include appropriate log levels for new functionality
3. **Update Metrics**: Add relevant metrics for new features
4. **Test Admin Features**: Ensure new functionality is accessible via admin portal
5. **Document Changes**: Update this documentation for new features

## 📋 Feature Checklist

- ✅ Enhanced logging system with rotation and metrics
- ✅ Advanced error monitoring and alerting
- ✅ Real-time admin web portal with dashboard
- ✅ Discord OAuth2 authentication
- ✅ Bot management controls (restart, reload, status)
- ✅ Error analytics and reporting
- ✅ Live metrics and performance monitoring
- ✅ Mobile-responsive design
- ✅ WebSocket real-time updates
- ✅ Comprehensive documentation
- ✅ Production-ready security features