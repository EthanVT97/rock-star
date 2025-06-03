const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config/default');

// Ensure logs directory exists
const logsDir = path.dirname(config.logging.file.filename);
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Custom log format
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.prettyPrint()
);

// Console format with colors
const consoleFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.colorize({ all: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let log = `${timestamp} [${level}]: ${message}`;
        
        // Add metadata if present
        if (Object.keys(meta).length > 0) {
            log += '\n' + JSON.stringify(meta, null, 2);
        }
        
        return log;
    })
);

// Create transports array
const transports = [];

// Console transport
if (config.logging.console.enabled) {
    transports.push(new winston.transports.Console({
        level: config.logging.console.level,
        format: config.logging.console.colorize ? consoleFormat : logFormat,
        handleExceptions: true,
        handleRejections: true
    }));
}

// File transport
if (config.logging.file.enabled) {
    transports.push(new winston.transports.File({
        filename: config.logging.file.filename,
        level: config.logging.file.level,
        format: logFormat,
        maxsize: config.logging.file.maxSize,
        maxFiles: config.logging.file.maxFiles,
        handleExceptions: true,
        handleRejections: true
    }));
}

// Error file transport
if (config.logging.file.enabled) {
    const errorLogFile = config.logging.file.filename.replace('.log', '-error.log');
    transports.push(new winston.transports.File({
        filename: errorLogFile,
        level: 'error',
        format: logFormat,
        maxsize: config.logging.file.maxSize,
        maxFiles: config.logging.file.maxFiles,
        handleExceptions: true,
        handleRejections: true
    }));
}

// Create logger instance
const logger = winston.createLogger({
    level: config.logging.level,
    format: logFormat,
    defaultMeta: {
        service: 'proxy-server',
        environment: config.environment,
        version: process.env.npm_package_version || '1.0.0'
    },
    transports: transports,
    exitOnError: false
});

// Request logging middleware
const requestLogger = (req, res, next) => {
    if (!config.logging.requests.enabled) {
        return next();
    }

    const startTime = Date.now();
    
    // Generate request ID if not present
    if (!req.id) {
        req.id = req.get('X-Request-ID') || 
                 `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // Log incoming request
    const requestData = {
        requestId: req.id,
        method: req.method,
        url: req.originalUrl,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
    };

    // Include headers if enabled
    if (config.logging.requests.includeHeaders) {
        requestData.headers = sanitizeHeaders(req.headers);
    }

    // Include body if enabled and present
    if (config.logging.requests.includeBody && req.body) {
        requestData.body = sanitizeBody(req.body);
    }

    logger.info('Incoming request', requestData);

    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function(chunk, encoding) {
        const responseTime = Date.now() - startTime;
        
        const responseData = {
            requestId: req.id,
            statusCode: res.statusCode,
            responseTime: responseTime,
            contentLength: res.get('Content-Length'),
            timestamp: new Date().toISOString()
        };

        // Log based on status code
        if (res.statusCode >= 400) {
            logger.warn('Request completed with error', responseData);
        } else {
            logger.info('Request completed', responseData);
        }

        originalEnd.call(this, chunk, encoding);
    };

    next();
};

// Sanitize sensitive headers
const sanitizeHeaders = (headers) => {
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
    const sanitized = { ...headers };
    
    sensitiveHeaders.forEach(header => {
        if (sanitized[header]) {
            sanitized[header] = '[REDACTED]';
        }
    });
    
    return sanitized;
};

// Sanitize request body
const sanitizeBody = (body) => {
    if (typeof body === 'string') {
        if (body.length > config.logging.requests.maxBodyLength) {
            return body.substring(0, config.logging.requests.maxBodyLength) + '... [TRUNCATED]';
        }
        return body;
    }
    
    if (typeof body === 'object') {
        const sanitized = { ...body };
        const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
        
        const sanitizeObject = (obj) => {
            Object.keys(obj).forEach(key => {
                if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
                    obj[key] = '[REDACTED]';
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    sanitizeObject(obj[key]);
                }
            });
        };
        
        sanitizeObject(sanitized);
        
        const jsonString = JSON.stringify(sanitized);
        if (jsonString.length > config.logging.requests.maxBodyLength) {
            return JSON.stringify(sanitized, null, 0).substring(0, config.logging.requests.maxBodyLength) + '... [TRUNCATED]';
        }
        
        return sanitized;
    }
    
    return body;
};

// Error logging helper
const logError = (error, context = {}) => {
    logger.error('Application error', {
        error: error.message,
        stack: error.stack,
        code: error.code,
        ...context,
        timestamp: new Date().toISOString()
    });
};

// Performance logging helper
const logPerformance = (operation, duration, metadata = {}) => {
    logger.info('Performance metric', {
        operation,
        duration,
        ...metadata,
        timestamp: new Date().toISOString()
    });
};

// Security event logging helper
const logSecurityEvent = (event, details = {}) => {
    logger.warn('Security event', {
        event,
        ...details,
        timestamp: new Date().toISOString()
    });
};

module.exports = {
    logger,
    requestLogger,
    logError,
    logPerformance,
    logSecurityEvent
};
