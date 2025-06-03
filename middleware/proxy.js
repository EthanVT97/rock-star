const { createProxyMiddleware } = require('http-proxy-middleware');
const config = require('../config/default');
const { logger } = require('./logger');

// Custom error handler for proxy errors
const onError = (err, req, res) => {
    logger.error('Proxy error:', {
        error: err.message,
        code: err.code,
        url: req.originalUrl,
        method: req.method,
        target: req.proxyTarget || config.proxy.target,
        timestamp: new Date().toISOString()
    });

    // Set appropriate status code based on error type
    let statusCode = 500;
    let message = 'Proxy Error';

    switch (err.code) {
        case 'ENOTFOUND':
            statusCode = 502;
            message = 'Bad Gateway - Target server not found';
            break;
        case 'ECONNREFUSED':
            statusCode = 502;
            message = 'Bad Gateway - Connection refused';
            break;
        case 'ETIMEDOUT':
            statusCode = 504;
            message = 'Gateway Timeout';
            break;
        case 'ECONNRESET':
            statusCode = 502;
            message = 'Bad Gateway - Connection reset';
            break;
        default:
            statusCode = 500;
            message = 'Internal Proxy Error';
    }

    if (!res.headersSent) {
        res.status(statusCode).json({
            error: message,
            code: err.code,
            timestamp: new Date().toISOString(),
            requestId: req.id
        });
    }
};

// Custom request interceptor
const onProxyReq = (proxyReq, req, res) => {
    // Add custom headers
    Object.entries(config.proxy.headers).forEach(([key, value]) => {
        proxyReq.setHeader(key, value);
    });

    // Add request ID for tracking
    if (req.id) {
        proxyReq.setHeader('X-Request-ID', req.id);
    }

    // Add original IP
    const originalIp = req.ip || req.connection.remoteAddress;
    if (originalIp) {
        proxyReq.setHeader('X-Forwarded-For', originalIp);
        proxyReq.setHeader('X-Real-IP', originalIp);
    }

    // Log outgoing request if enabled
    if (config.proxy.logRequests) {
        logger.info('Proxying request:', {
            method: req.method,
            originalUrl: req.originalUrl,
            target: req.proxyTarget || config.proxy.target,
            headers: config.logging.requests.includeHeaders ? req.headers : undefined,
            ip: originalIp,
            userAgent: req.get('User-Agent'),
            timestamp: new Date().toISOString(),
            requestId: req.id
        });
    }
};

// Custom response interceptor
const onProxyRes = (proxyRes, req, res) => {
    // Add response headers
    proxyRes.headers['X-Proxy-By'] = 'custom-proxy-server';
    proxyRes.headers['X-Response-Time'] = Date.now() - req.startTime;

    if (req.id) {
        proxyRes.headers['X-Request-ID'] = req.id;
    }

    // Log response if enabled
    if (config.proxy.logResponses) {
        logger.info('Proxy response:', {
            statusCode: proxyRes.statusCode,
            statusMessage: proxyRes.statusMessage,
            method: req.method,
            originalUrl: req.originalUrl,
            target: req.proxyTarget || config.proxy.target,
            responseTime: Date.now() - req.startTime,
            contentLength: proxyRes.headers['content-length'],
            contentType: proxyRes.headers['content-type'],
            timestamp: new Date().toISOString(),
            requestId: req.id
        });
    }

    // Update request counter
    if (!req.app.locals.requestCount) {
        req.app.locals.requestCount = 0;
    }
    req.app.locals.requestCount++;
};

// Router function for dynamic target selection
const router = (req) => {
    // Check if custom router is configured
    if (config.proxy.router) {
        for (const [pattern, target] of Object.entries(config.proxy.router)) {
            if (req.originalUrl.match(new RegExp(pattern))) {
                req.proxyTarget = target;
                return target;
            }
        }
    }

    // Check for custom target header
    const customTarget = req.get('X-Proxy-Target');
    if (customTarget && isValidTarget(customTarget)) {
        req.proxyTarget = customTarget;
        return customTarget;
    }

    // Default target
    req.proxyTarget = config.proxy.target;
    return config.proxy.target;
};

// Validate target URL
const isValidTarget = (target) => {
    try {
        const url = new URL(target);
        return ['http:', 'https:'].includes(url.protocol);
    } catch {
        return false;
    }
};

// Filter function to determine which requests to proxy
const filter = (pathname, req) => {
    // Skip health check and stats endpoints
    if (config.proxy.excludePaths.includes(pathname)) {
        return false;
    }

    // Skip favicon requests if not explicitly proxied
    if (pathname === '/favicon.ico' && !config.proxy.includeFavicon) {
        return false;
    }

    return true;
};

// Create the proxy middleware with configuration
const proxyMiddleware = createProxyMiddleware({
    target: config.proxy.target,
    changeOrigin: config.proxy.changeOrigin,
    secure: config.proxy.secure,
    ws: config.proxy.ws,
    timeout: config.proxy.timeout,
    proxyTimeout: config.proxy.proxyTimeout,
    pathRewrite: config.proxy.pathRewrite,
    router: router,
    onError: config.proxy.onError ? onError : undefined,
    onProxyReq: config.proxy.onProxyReq ? onProxyReq : undefined,
    onProxyRes: config.proxy.onProxyRes ? onProxyRes : undefined,
    logLevel: config.logging.level === 'debug' ? 'debug' : 'warn',
    
    // Custom headers
    headers: config.proxy.headers,
    
    // Filter requests
    filter: filter,
    
    // Follow redirects
    followRedirects: true,
    
    // Self handle response for custom processing
    selfHandleResponse: false,
    
    // Buffer configuration
    buffer: true
});

// Middleware wrapper to add request tracking
const enhancedProxyMiddleware = (req, res, next) => {
    // Add request ID and start time
    req.id = req.get('X-Request-ID') || 
             `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    req.startTime = Date.now();

    // Apply proxy middleware
    proxyMiddleware(req, res, next);
};

module.exports = enhancedProxyMiddleware;
