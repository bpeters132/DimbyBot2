import express from 'express'
import session from 'express-session'
import passport from 'passport'
import { Strategy as DiscordStrategy } from 'passport-discord'
import rateLimit from 'express-rate-limit'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default class AdminServer {
  constructor(botClient, logger, options = {}) {
    this.bot = botClient
    this.logger = logger
    this.options = {
      port: options.port || process.env.ADMIN_PORT || 3000,
      sessionSecret: options.sessionSecret || process.env.SESSION_SECRET || 'your-session-secret-here',
      discordClientId: options.discordClientId || process.env.DISCORD_CLIENT_ID,
      discordClientSecret: options.discordClientSecret || process.env.DISCORD_CLIENT_SECRET,
      adminUserIds: options.adminUserIds || (process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',') : []),
      enableAuth: options.enableAuth ?? true,
      ...options
    }

    this.app = express()
    this.server = createServer(this.app)
    this.wss = new WebSocketServer({ server: this.server })
    this.connectedClients = new Set()

    this.setupMiddleware()
    this.setupAuth()
    this.setupRoutes()
    this.setupWebSocket()
  }

  setupMiddleware() {
    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.'
    })

    this.app.use(limiter)
    this.app.use(express.json())
    this.app.use(express.urlencoded({ extended: true }))
    
    // Session configuration
    this.app.use(session({
      secret: this.options.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      }
    }))

    // Static files
    this.app.use('/static', express.static(path.join(__dirname, 'public')))
  }

  setupAuth() {
    if (!this.options.enableAuth) {
      this.logger.warn('[AdminServer] Authentication is disabled!')
      return
    }

    this.app.use(passport.initialize())
    this.app.use(passport.session())

    // Discord OAuth2 Strategy
    passport.use(new DiscordStrategy({
      clientID: this.options.discordClientId,
      clientSecret: this.options.discordClientSecret,
      callbackURL: '/auth/discord/callback',
      scope: ['identify']
    }, (accessToken, refreshToken, profile, done) => {
      // Check if user is admin
      if (this.options.adminUserIds.includes(profile.id)) {
        return done(null, profile)
      } else {
        return done(null, false, { message: 'Access denied: Not an admin user' })
      }
    }))

    passport.serializeUser((user, done) => {
      done(null, user.id)
    })

    passport.deserializeUser((id, done) => {
      done(null, { id })
    })

    // Auth middleware
    this.requireAuth = (req, res, next) => {
      if (!this.options.enableAuth) return next()
      
      if (req.isAuthenticated()) {
        return next()
      }
      res.redirect('/login')
    }

    // Auth routes
    this.app.get('/login', (req, res) => {
      res.send(this.generateLoginPage())
    })

    this.app.get('/auth/discord', passport.authenticate('discord'))

    this.app.get('/auth/discord/callback',
      passport.authenticate('discord', { failureRedirect: '/login' }),
      (req, res) => {
        res.redirect('/')
      }
    )

    this.app.get('/logout', (req, res) => {
      req.logout((err) => {
        if (err) this.logger.error('[AdminServer] Logout error:', err)
        res.redirect('/login')
      })
    })
  }

  setupRoutes() {
    // Main dashboard
    this.app.get('/', this.requireAuth, (req, res) => {
      res.send(this.generateDashboard())
    })

    // API Routes
    this.app.get('/api/stats', this.requireAuth, (req, res) => {
      try {
        const stats = this.bot.getSystemMetrics()
        res.json(stats)
      } catch (error) {
        this.logger.error('[AdminServer] Error fetching stats:', error)
        res.status(500).json({ error: 'Failed to fetch statistics' })
      }
    })

    this.app.get('/api/guilds', this.requireAuth, (req, res) => {
      try {
        const guilds = this.bot.guilds.cache.map(guild => ({
          id: guild.id,
          name: guild.name,
          memberCount: guild.memberCount,
          ownerID: guild.ownerId,
          icon: guild.iconURL(),
          joinedAt: guild.joinedAt
        }))
        res.json(guilds)
      } catch (error) {
        this.logger.error('[AdminServer] Error fetching guilds:', error)
        res.status(500).json({ error: 'Failed to fetch guilds' })
      }
    })

    this.app.get('/api/errors', this.requireAuth, (req, res) => {
      try {
        const errorStats = this.bot.getErrorStats()
        res.json(errorStats)
      } catch (error) {
        this.logger.error('[AdminServer] Error fetching error stats:', error)
        res.status(500).json({ error: 'Failed to fetch error statistics' })
      }
    })

    this.app.get('/api/logs', this.requireAuth, (req, res) => {
      try {
        const logMetrics = this.bot.logger.getMetrics()
        res.json(logMetrics)
      } catch (error) {
        this.logger.error('[AdminServer] Error fetching log metrics:', error)
        res.status(500).json({ error: 'Failed to fetch log metrics' })
      }
    })

    // Bot control endpoints
    this.app.post('/api/bot/restart', this.requireAuth, async (req, res) => {
      try {
        this.logger.info('[AdminServer] Bot restart requested by admin')
        res.json({ message: 'Restart initiated', success: true })
        
        // Graceful restart after sending response
        setTimeout(() => {
          process.exit(0) // Let process manager (PM2, Docker, etc.) restart
        }, 1000)
      } catch (error) {
        this.logger.error('[AdminServer] Error restarting bot:', error)
        res.status(500).json({ error: 'Failed to restart bot' })
      }
    })

    this.app.post('/api/bot/reload-commands', this.requireAuth, async (req, res) => {
      try {
        this.logger.info('[AdminServer] Command reload requested by admin')
        
        // Clear existing commands
        this.bot.commands?.clear()
        
        // Reload commands
        const loadCommands = (await import('../util/loadCommands.js')).default
        await loadCommands(this.bot)
        
        res.json({ message: 'Commands reloaded successfully', success: true })
      } catch (error) {
        this.logger.error('[AdminServer] Error reloading commands:', error)
        res.status(500).json({ error: 'Failed to reload commands' })
      }
    })

    this.app.post('/api/bot/change-status', this.requireAuth, async (req, res) => {
      try {
        const { status, activity } = req.body
        
        await this.bot.user.setPresence({
          status: status || 'online',
          activities: activity ? [{
            name: activity,
            type: 0 // Playing
          }] : []
        })

        this.logger.info(`[AdminServer] Bot status changed to: ${status}, activity: ${activity}`)
        res.json({ message: 'Status updated successfully', success: true })
      } catch (error) {
        this.logger.error('[AdminServer] Error changing bot status:', error)
        res.status(500).json({ error: 'Failed to change bot status' })
      }
    })

    // Error report endpoint
    this.app.get('/api/error-report', this.requireAuth, (req, res) => {
      try {
        const report = this.bot.errorMonitor.generateErrorReport()
        res.json(report)
      } catch (error) {
        this.logger.error('[AdminServer] Error generating error report:', error)
        res.status(500).json({ error: 'Failed to generate error report' })
      }
    })

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      })
    })
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      this.logger.debug('[AdminServer] WebSocket client connected')
      this.connectedClients.add(ws)

      ws.on('close', () => {
        this.connectedClients.delete(ws)
      })

      ws.on('error', (error) => {
        this.logger.error('[AdminServer] WebSocket error:', error)
        this.connectedClients.delete(ws)
      })

      // Send initial data
      this.sendToClient(ws, {
        type: 'init',
        data: this.bot.getSystemMetrics()
      })
    })

    // Send real-time updates every 5 seconds
    setInterval(() => {
      this.broadcastUpdate()
    }, 5000)
  }

  sendToClient(ws, data) {
    try {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(data))
      }
    } catch (error) {
      this.logger.error('[AdminServer] Error sending WebSocket message:', error)
    }
  }

  broadcastUpdate() {
    if (this.connectedClients.size === 0) return

    try {
      const stats = this.bot.getSystemMetrics()
      const updateData = {
        type: 'update',
        data: stats,
        timestamp: new Date().toISOString()
      }

      this.connectedClients.forEach(ws => {
        this.sendToClient(ws, updateData)
      })
    } catch (error) {
      this.logger.error('[AdminServer] Error broadcasting update:', error)
    }
  }

  generateDashboard() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Discord Bot Admin Panel</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: #2c3e50; 
            color: #ecf0f1; 
            line-height: 1.6;
        }
        .header {
            background: #34495e;
            padding: 1rem 2rem;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .header h1 { color: #3498db; }
        .nav { display: flex; gap: 1rem; }
        .nav button {
            background: #3498db;
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: 5px;
            cursor: pointer;
            transition: background 0.3s;
        }
        .nav button:hover { background: #2980b9; }
        .nav button.danger { background: #e74c3c; }
        .nav button.danger:hover { background: #c0392b; }
        .container { 
            max-width: 1400px; 
            margin: 0 auto; 
            padding: 2rem; 
        }
        .grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); 
            gap: 2rem; 
            margin-bottom: 2rem; 
        }
        .card {
            background: #34495e;
            border-radius: 10px;
            padding: 1.5rem;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            border-left: 4px solid #3498db;
        }
        .card h3 { 
            color: #3498db; 
            margin-bottom: 1rem; 
            display: flex; 
            align-items: center; 
            gap: 0.5rem; 
        }
        .stat { 
            display: flex; 
            justify-content: space-between; 
            margin: 0.5rem 0; 
            padding: 0.5rem 0;
            border-bottom: 1px solid #2c3e50;
        }
        .stat:last-child { border-bottom: none; }
        .stat-value { 
            font-weight: bold; 
            color: #2ecc71; 
        }
        .error-card { border-left-color: #e74c3c; }
        .performance-card { border-left-color: #f39c12; }
        .memory-card { border-left-color: #9b59b6; }
        .chart-container { 
            position: relative; 
            height: 300px; 
            margin-top: 1rem; 
        }
        .log-container {
            background: #2c3e50;
            border: 1px solid #34495e;
            border-radius: 5px;
            padding: 1rem;
            height: 200px;
            overflow-y: auto;
            font-family: 'Courier New', monospace;
            font-size: 0.9rem;
        }
        .status-indicator {
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            margin-right: 0.5rem;
        }
        .status-online { background: #2ecc71; }
        .status-warning { background: #f39c12; }
        .status-error { background: #e74c3c; }
        .guild-list {
            max-height: 300px;
            overflow-y: auto;
        }
        .guild-item {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 0.5rem;
            border-bottom: 1px solid #2c3e50;
        }
        .guild-icon {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: #3498db;
        }
        .controls { 
            display: flex; 
            gap: 1rem; 
            flex-wrap: wrap; 
            margin-top: 1rem; 
        }
        .controls button {
            background: #3498db;
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 5px;
            cursor: pointer;
            transition: all 0.3s;
        }
        .controls button:hover { transform: translateY(-2px); }
        .controls button.warning { background: #f39c12; }
        .controls button.danger { background: #e74c3c; }
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            z-index: 1000;
        }
        .modal-content {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #34495e;
            padding: 2rem;
            border-radius: 10px;
            min-width: 400px;
        }
        .close { 
            float: right; 
            font-size: 1.5rem; 
            cursor: pointer; 
            color: #e74c3c; 
        }
        input, select {
            width: 100%;
            padding: 0.5rem;
            margin: 0.5rem 0;
            border: 1px solid #2c3e50;
            border-radius: 5px;
            background: #2c3e50;
            color: #ecf0f1;
        }
        @media (max-width: 768px) {
            .grid { grid-template-columns: 1fr; }
            .container { padding: 1rem; }
            .header { padding: 1rem; }
            .nav { flex-direction: column; gap: 0.5rem; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🤖 Discord Bot Admin Panel</h1>
        <div class="nav">
            <button onclick="refreshData()">🔄 Refresh</button>
            <button onclick="showStatusModal()">⚙️ Change Status</button>
            <button onclick="reloadCommands()" class="warning">🔄 Reload Commands</button>
            <button onclick="restartBot()" class="danger">🔄 Restart Bot</button>
            <button onclick="window.location.href='/logout'" class="danger">🚪 Logout</button>
        </div>
    </div>

    <div class="container">
        <div class="grid">
            <!-- System Overview -->
            <div class="card">
                <h3>📊 System Overview</h3>
                <div class="stat">
                    <span>Status:</span>
                    <span class="stat-value">
                        <span class="status-indicator status-online"></span>
                        <span id="bot-status">Online</span>
                    </span>
                </div>
                <div class="stat">
                    <span>Uptime:</span>
                    <span class="stat-value" id="uptime">-</span>
                </div>
                <div class="stat">
                    <span>Guilds:</span>
                    <span class="stat-value" id="guild-count">-</span>
                </div>
                <div class="stat">
                    <span>Users:</span>
                    <span class="stat-value" id="user-count">-</span>
                </div>
                <div class="stat">
                    <span>Channels:</span>
                    <span class="stat-value" id="channel-count">-</span>
                </div>
                <div class="stat">
                    <span>Ping:</span>
                    <span class="stat-value" id="ping">-</span>
                </div>
            </div>

            <!-- Error Statistics -->
            <div class="card error-card">
                <h3>❌ Error Statistics</h3>
                <div class="stat">
                    <span>Critical Errors:</span>
                    <span class="stat-value" id="critical-errors">-</span>
                </div>
                <div class="stat">
                    <span>Last Hour:</span>
                    <span class="stat-value" id="errors-hour">-</span>
                </div>
                <div class="stat">
                    <span>Last 24h:</span>
                    <span class="stat-value" id="errors-day">-</span>
                </div>
                <div class="stat">
                    <span>Error Patterns:</span>
                    <span class="stat-value" id="error-patterns">-</span>
                </div>
                <div class="controls">
                    <button onclick="downloadErrorReport()">📋 Download Report</button>
                </div>
            </div>

            <!-- Memory Usage -->
            <div class="card memory-card">
                <h3>💾 Memory Usage</h3>
                <div class="stat">
                    <span>RSS:</span>
                    <span class="stat-value" id="memory-rss">-</span>
                </div>
                <div class="stat">
                    <span>Heap Used:</span>
                    <span class="stat-value" id="memory-heap-used">-</span>
                </div>
                <div class="stat">
                    <span>Heap Total:</span>
                    <span class="stat-value" id="memory-heap-total">-</span>
                </div>
                <div class="stat">
                    <span>External:</span>
                    <span class="stat-value" id="memory-external">-</span>
                </div>
                <div class="chart-container">
                    <canvas id="memoryChart"></canvas>
                </div>
            </div>

            <!-- Performance -->
            <div class="card performance-card">
                <h3>⚡ Performance</h3>
                <div class="stat">
                    <span>Total Logs:</span>
                    <span class="stat-value" id="total-logs">-</span>
                </div>
                <div class="stat">
                    <span>Errors:</span>
                    <span class="stat-value" id="log-errors">-</span>
                </div>
                <div class="stat">
                    <span>Warnings:</span>
                    <span class="stat-value" id="log-warnings">-</span>
                </div>
                <div class="stat">
                    <span>Info:</span>
                    <span class="stat-value" id="log-info">-</span>
                </div>
                <div class="chart-container">
                    <canvas id="performanceChart"></canvas>
                </div>
            </div>
        </div>

        <!-- Guilds List -->
        <div class="card">
            <h3>🏰 Guilds</h3>
            <div class="guild-list" id="guilds-list">
                Loading guilds...
            </div>
        </div>

        <!-- Live Logs -->
        <div class="card">
            <h3>📝 Live System Updates</h3>
            <div class="log-container" id="live-logs">
                Connecting to live updates...
            </div>
        </div>
    </div>

    <!-- Status Change Modal -->
    <div id="statusModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal()">&times;</span>
            <h3>Change Bot Status</h3>
            <label>Status:</label>
            <select id="status-select">
                <option value="online">Online</option>
                <option value="idle">Idle</option>
                <option value="dnd">Do Not Disturb</option>
                <option value="invisible">Invisible</option>
            </select>
            <label>Activity:</label>
            <input type="text" id="activity-input" placeholder="Enter activity (optional)">
            <div class="controls">
                <button onclick="updateStatus()">Update Status</button>
                <button onclick="closeModal()">Cancel</button>
            </div>
        </div>
    </div>

    <script>
        let ws;
        let memoryChart, performanceChart;
        
        // Initialize WebSocket connection
        function initWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(\`\${protocol}//\${window.location.host}\`);
            
            ws.onopen = () => {
                console.log('WebSocket connected');
                addLogEntry('WebSocket connected - receiving live updates');
            };
            
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'update' || data.type === 'init') {
                    updateDashboard(data.data);
                }
            };
            
            ws.onclose = () => {
                console.log('WebSocket disconnected');
                addLogEntry('WebSocket disconnected - attempting to reconnect...');
                setTimeout(initWebSocket, 5000);
            };
            
            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                addLogEntry('WebSocket error occurred');
            };
        }
        
        // Initialize charts
        function initCharts() {
            const memoryCtx = document.getElementById('memoryChart').getContext('2d');
            memoryChart = new Chart(memoryCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Heap Used', 'Heap Free', 'External'],
                    datasets: [{
                        data: [0, 0, 0],
                        backgroundColor: ['#e74c3c', '#2ecc71', '#f39c12']
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
            
            const perfCtx = document.getElementById('performanceChart').getContext('2d');
            performanceChart = new Chart(perfCtx, {
                type: 'bar',
                data: {
                    labels: ['Info', 'Warnings', 'Errors', 'Debug'],
                    datasets: [{
                        label: 'Log Counts',
                        data: [0, 0, 0, 0],
                        backgroundColor: ['#3498db', '#f39c12', '#e74c3c', '#9b59b6']
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }
        
        // Update dashboard with new data
        function updateDashboard(data) {
            // System overview
            document.getElementById('uptime').textContent = formatUptime(data.uptime / 1000);
            document.getElementById('guild-count').textContent = data.guilds;
            document.getElementById('user-count').textContent = data.users;
            document.getElementById('channel-count').textContent = data.channels;
            document.getElementById('ping').textContent = data.ping + 'ms';
            
            // Error statistics
            document.getElementById('critical-errors').textContent = data.errors.totalCriticalErrors;
            document.getElementById('errors-hour').textContent = data.errors.recentTrends.lastHour;
            document.getElementById('errors-day').textContent = data.errors.recentTrends.last24Hours;
            document.getElementById('error-patterns').textContent = data.errors.uniqueErrorPatterns;
            
            // Memory usage
            document.getElementById('memory-rss').textContent = Math.round(data.memory.rss / 1024 / 1024) + 'MB';
            document.getElementById('memory-heap-used').textContent = Math.round(data.memory.heapUsed / 1024 / 1024) + 'MB';
            document.getElementById('memory-heap-total').textContent = Math.round(data.memory.heapTotal / 1024 / 1024) + 'MB';
            document.getElementById('memory-external').textContent = Math.round(data.memory.external / 1024 / 1024) + 'MB';
            
            // Performance
            const totalLogs = data.info + data.warnings + data.errors + data.debug;
            document.getElementById('total-logs').textContent = totalLogs;
            document.getElementById('log-errors').textContent = data.errors;
            document.getElementById('log-warnings').textContent = data.warnings;
            document.getElementById('log-info').textContent = data.info;
            
            // Update charts
            if (memoryChart) {
                const heapFree = data.memory.heapTotal - data.memory.heapUsed;
                memoryChart.data.datasets[0].data = [
                    data.memory.heapUsed / 1024 / 1024,
                    heapFree / 1024 / 1024,
                    data.memory.external / 1024 / 1024
                ];
                memoryChart.update();
            }
            
            if (performanceChart) {
                performanceChart.data.datasets[0].data = [data.info, data.warnings, data.errors, data.debug];
                performanceChart.update();
            }
            
            addLogEntry(\`Dashboard updated - \${new Date().toLocaleTimeString()}\`);
        }
        
        // Utility functions
        function formatUptime(seconds) {
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            
            const parts = [];
            if (days > 0) parts.push(\`\${days}d\`);
            if (hours > 0) parts.push(\`\${hours}h\`);
            if (minutes > 0) parts.push(\`\${minutes}m\`);
            if (secs > 0 || parts.length === 0) parts.push(\`\${secs}s\`);
            
            return parts.join(' ');
        }
        
        function addLogEntry(message) {
            const logContainer = document.getElementById('live-logs');
            const timestamp = new Date().toLocaleTimeString();
            logContainer.innerHTML += \`<div>[\${timestamp}] \${message}</div>\`;
            logContainer.scrollTop = logContainer.scrollHeight;
            
            // Keep only last 50 entries
            const entries = logContainer.children;
            if (entries.length > 50) {
                logContainer.removeChild(entries[0]);
            }
        }
        
        // API functions
        async function refreshData() {
            try {
                const response = await fetch('/api/stats');
                const data = await response.json();
                updateDashboard(data);
                addLogEntry('Manual refresh completed');
            } catch (error) {
                addLogEntry('Failed to refresh data: ' + error.message);
            }
        }
        
        async function loadGuilds() {
            try {
                const response = await fetch('/api/guilds');
                const guilds = await response.json();
                const container = document.getElementById('guilds-list');
                
                container.innerHTML = guilds.map(guild => \`
                    <div class="guild-item">
                        <img class="guild-icon" src="\${guild.icon || '/static/default-guild.png'}" alt="\${guild.name}">
                        <div>
                            <strong>\${guild.name}</strong><br>
                            <small>\${guild.memberCount} members</small>
                        </div>
                    </div>
                \`).join('');
            } catch (error) {
                addLogEntry('Failed to load guilds: ' + error.message);
            }
        }
        
        async function reloadCommands() {
            try {
                const response = await fetch('/api/bot/reload-commands', { method: 'POST' });
                const result = await response.json();
                addLogEntry(result.success ? 'Commands reloaded successfully' : 'Failed to reload commands');
            } catch (error) {
                addLogEntry('Failed to reload commands: ' + error.message);
            }
        }
        
        async function restartBot() {
            if (!confirm('Are you sure you want to restart the bot?')) return;
            
            try {
                const response = await fetch('/api/bot/restart', { method: 'POST' });
                const result = await response.json();
                addLogEntry('Bot restart initiated...');
            } catch (error) {
                addLogEntry('Failed to restart bot: ' + error.message);
            }
        }
        
        async function updateStatus() {
            const status = document.getElementById('status-select').value;
            const activity = document.getElementById('activity-input').value;
            
            try {
                const response = await fetch('/api/bot/change-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status, activity })
                });
                const result = await response.json();
                addLogEntry(result.success ? 'Bot status updated' : 'Failed to update status');
                closeModal();
            } catch (error) {
                addLogEntry('Failed to update status: ' + error.message);
            }
        }
        
        async function downloadErrorReport() {
            try {
                const response = await fetch('/api/error-report');
                const report = await response.json();
                const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = \`error-report-\${new Date().toISOString().split('T')[0]}.json\`;
                a.click();
                URL.revokeObjectURL(url);
                addLogEntry('Error report downloaded');
            } catch (error) {
                addLogEntry('Failed to download error report: ' + error.message);
            }
        }
        
        // Modal functions
        function showStatusModal() {
            document.getElementById('statusModal').style.display = 'block';
        }
        
        function closeModal() {
            document.getElementById('statusModal').style.display = 'none';
        }
        
        // Initialize everything
        document.addEventListener('DOMContentLoaded', () => {
            initCharts();
            initWebSocket();
            loadGuilds();
            addLogEntry('Admin panel initialized');
        });
        
        // Close modal when clicking outside
        window.onclick = (event) => {
            const modal = document.getElementById('statusModal');
            if (event.target === modal) {
                closeModal();
            }
        };
    </script>
</body>
</html>`
  }

  generateLoginPage() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Discord Bot Admin - Login</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .login-container {
            background: rgba(255, 255, 255, 0.95);
            padding: 3rem;
            border-radius: 15px;
            box-shadow: 0 15px 35px rgba(0,0,0,0.1);
            text-align: center;
            min-width: 400px;
        }
        .login-container h1 {
            color: #333;
            margin-bottom: 2rem;
        }
        .discord-btn {
            background: #5865F2;
            color: white;
            padding: 1rem 2rem;
            border: none;
            border-radius: 8px;
            font-size: 1.1rem;
            cursor: pointer;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            transition: all 0.3s;
        }
        .discord-btn:hover {
            background: #4752C4;
            transform: translateY(-2px);
        }
        .info {
            margin-top: 2rem;
            color: #666;
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <h1>🤖 Discord Bot Admin Panel</h1>
        <p>Please authenticate with Discord to access the admin panel.</p>
        <br>
        <a href="/auth/discord" class="discord-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0190 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9460 2.4189-2.1568 2.4189Z"/>
            </svg>
            Login with Discord
        </a>
        <div class="info">
            <p>Only authorized administrators can access this panel.</p>
        </div>
    </div>
</body>
</html>`
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server.listen(this.options.port, (err) => {
        if (err) {
          this.logger.error('[AdminServer] Failed to start server:', err)
          reject(err)
        } else {
          this.logger.info(`[AdminServer] Started on port ${this.options.port}`)
          resolve()
        }
      })
    })
  }

  stop() {
    return new Promise((resolve) => {
      this.server.close(() => {
        this.logger.info('[AdminServer] Server stopped')
        resolve()
      })
    })
  }
}