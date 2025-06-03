const path = require('path');

// Load environment variables
require('dotenv').config();

const config = {
    server: {
        port: parseInt(process.env.PORT, 10) || 5000,
        host: process.env.HOST || '0.0.0.0',
        bodyLimit: process.env.BODY_LIMIT || '10mb'
    },
    
    proxy: {
        // Default target URL for proxying requests
        target: process.env.PROXY_TARGET || 'https://httpbin.org',
        
        // Proxy configuration options
        changeOrigin: process.env.PROXY_CHANGE_ORIGIN === 'true' || true,
        secure: process.env.PROXY_SECURE === 'true' || true,
        
        // Timeout settings (in milliseconds)
        timeout: parseInt(process.env.PROXY_TIMEOUT, 10) || 30000,
        proxyTimeout: parseInt(process.env.PROXY_TIMEOUT, 10) || 30000,
        
        // Headers to add/modify
        headers: {
            'X-Forwarded-Proto': process.env.PROXY_PROTOCOL || 'http',
            'X-Proxy-By': 'custom-proxy-server'
        },
        
        // Paths to exclude from proxying
        excludePaths: process.env.PROXY_EXCLUDE_PATHS ? 
            process.env.PROXY_EXCLUDE_PATHS.split(',').map(p => p.trim()) : 
            ['/health', '/stats'],
        
        // Enable/disable request/response logging
        logRequests: process.env.PROXY_LOG_REQUESTS !== 'false',
        logResponses: process.env.PROXY_LOG_RESPONSES !== 'false',
        
        // Custom path rewriting rules
        pathRewrite: process.env.PROXY_PATH_REWRITE ? 
            JSON.parse(process.env.PROXY_PATH_REWRITE) : {},
        
        // Router function for dynamic target selection
        router: process.env.PROXY_ROUTER ? 
            JSON.parse(process.env.PROXY_ROUTER) : null,
        
        // WebSocket support
        ws: process.env.PROXY_WEBSOCKET === 'true' || false,
        
        // Custom error handling
        onError: true,
        onProxyReq: true,
        onProxyRes: true
    },
    
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.LOG_FORMAT || 'combined',
        
        // File logging configuration
        file: {
            enabled: process.env.LOG_FILE_ENABLED !== 'false',
            filename: process.env.LOG_FILE || path.join(__dirname, '..', 'logs', 'proxy.log'),
            maxSize: process.env.LOG_MAX_SIZE || '10m',
            maxFiles: parseInt(process.env.LOG_MAX_FILES, 10) || 5,
            level: process.env.LOG_FILE_LEVEL || 'info'
        },
        
        // Console logging configuration
        console: {
            enabled: process.env.LOG_CONSOLE_ENABLED !== 'false',
            level: process.env.LOG_CONSOLE_LEVEL || 'info',
            colorize: process.env.LOG_COLORIZE !== 'false'
        },
        
        // Request logging configuration
        requests: {
            enabled: process.env.LOG_REQUESTS_ENABLED !== 'false',
            includeBody: process.env.LOG_REQUEST_BODY === 'true' || false,
            includeHeaders: process.env.LOG_REQUEST_HEADERS === 'true' || false,
            maxBodyLength: parseInt(process.env.LOG_MAX_BODY_LENGTH, 10) || 1000
        }
    },
    
    // Rate limiting configuration
    rateLimit: {
        enabled: process.env.RATE_LIMIT_ENABLED === 'true' || false,
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 15 * 60 * 1000, // 15 minutes
        max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100, // limit each IP to 100 requests per windowMs
        message: process.env.RATE_LIMIT_MESSAGE || 'Too many requests from this IP'
    },
    
    // Security headers
    security: {
        helmet: {
            enabled: process.env.SECURITY_HELMET_ENABLED !== 'false',
            contentSecurityPolicy: process.env.SECURITY_CSP === 'true' || false,
            hsts: process.env.SECURITY_HSTS !== 'false'
        }
    },
    
    // Development/production environment settings
    environment: process.env.NODE_ENV || 'development',
    
    // Custom middleware configuration
    middleware: {
        // Add custom middleware configurations here
        compression: process.env.COMPRESSION_ENABLED !== 'false',
        trustProxy: process.env.TRUST_PROXY === 'true' || false
    }
};

// Validation function to ensure required configurations are present
config.validate = function() {
    const errors = [];
    
    if (!config.proxy.target) {
        errors.push('PROXY_TARGET is required');
    }
    
    if (config.server.port < 1 || config.server.port > 65535) {
        errors.push('PORT must be between 1 and 65535');
    }
    
    if (config.proxy.timeout < 1000) {
        errors.push('PROXY_TIMEOUT must be at least 1000ms');
    }
    
    if (errors.length > 0) {
        throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
    
    return true;
};

module.exports = config;
