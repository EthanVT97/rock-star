const express = require('express');
const cors = require('cors');
const config = require('./config/default');
const proxyMiddleware = require('./middleware/proxy');
const { logger, requestLogger } = require('./middleware/logger');

class ProxyServer {
    constructor(options = {}) {
        this.app = express();
        this.port = options.port || config.server.port;
        this.host = options.host || config.server.host;
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    setupMiddleware() {
        // Enable CORS for all routes
        this.app.use(cors({
            origin: true,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
        }));

        // Parse JSON bodies
        this.app.use(express.json({ limit: config.server.bodyLimit }));
        this.app.use(express.urlencoded({ extended: true, limit: config.server.bodyLimit }));

        // Serve static files from public directory
        this.app.use('/admin', express.static('public'));
        this.app.use(express.static('public'));

        // Request logging middleware
        this.app.use(requestLogger);

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                version: process.env.npm_package_version || '1.0.0'
            });
        });

        // Stats endpoint
        this.app.get('/stats', (req, res) => {
            res.json({
                requests: req.app.locals.requestCount || 0,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                timestamp: new Date().toISOString()
            });
        });
    }

    setupRoutes() {
        // Apply proxy middleware to all routes except health and stats
        this.app.use((req, res, next) => {
            // Skip proxy for health and stats endpoints
            if (req.path === '/health' || req.path === '/stats') {
                return next();
            }
            // Apply proxy middleware for all other routes
            proxyMiddleware(req, res, next);
        });

        // Catch-all route for undefined endpoints
        this.app.use((req, res) => {
            logger.warn(`Route not found: ${req.method} ${req.originalUrl}`);
            res.status(404).json({
                error: 'Route not found',
                method: req.method,
                url: req.originalUrl,
                timestamp: new Date().toISOString()
            });
        });
    }

    setupErrorHandling() {
        // Global error handler
        this.app.use((err, req, res, next) => {
            logger.error('Unhandled error:', {
                error: err.message,
                stack: err.stack,
                url: req.originalUrl,
                method: req.method,
                headers: req.headers,
                timestamp: new Date().toISOString()
            });

            // Don't expose error details in production
            const isDevelopment = process.env.NODE_ENV === 'development';
            
            res.status(err.status || 500).json({
                error: 'Internal Server Error',
                message: isDevelopment ? err.message : 'Something went wrong',
                timestamp: new Date().toISOString()
            });
        });

        // Handle 404 errors
        this.app.use((req, res) => {
            res.status(404).json({
                error: 'Not Found',
                message: `Cannot ${req.method} ${req.originalUrl}`,
                timestamp: new Date().toISOString()
            });
        });
    }

    start() {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, this.host, () => {
                    logger.info(`Proxy server started on ${this.host}:${this.port}`);
                    logger.info(`Health check: http://${this.host}:${this.port}/health`);
                    logger.info(`Stats endpoint: http://${this.host}:${this.port}/stats`);
                    resolve(this.server);
                });

                this.server.on('error', (err) => {
                    logger.error('Server error:', err);
                    reject(err);
                });

                // Graceful shutdown handling
                process.on('SIGTERM', this.gracefulShutdown.bind(this));
                process.on('SIGINT', this.gracefulShutdown.bind(this));

            } catch (error) {
                logger.error('Failed to start server:', error);
                reject(error);
            }
        });
    }

    gracefulShutdown() {
        logger.info('Received shutdown signal, closing server...');
        
        if (this.server) {
            this.server.close((err) => {
                if (err) {
                    logger.error('Error during server shutdown:', err);
                    process.exit(1);
                } else {
                    logger.info('Server closed successfully');
                    process.exit(0);
                }
            });

            // Force close after 10 seconds
            setTimeout(() => {
                logger.error('Force closing server after timeout');
                process.exit(1);
            }, 10000);
        } else {
            process.exit(0);
        }
    }

    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(resolve);
            } else {
                resolve();
            }
        });
    }
}

module.exports = ProxyServer;
