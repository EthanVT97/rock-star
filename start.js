#!/usr/bin/env node

/**
 * HTTP Proxy Server Entry Point
 * 
 * This file serves as the main entry point for the proxy server.
 * It can be used both as a CLI tool and as a module.
 */

const path = require('path');
const fs = require('fs');

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Set NODE_ENV if not already set
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'development';
}

// Load environment variables from .env file
const dotenvPath = path.join(__dirname, '.env');
if (fs.existsSync(dotenvPath)) {
    require('dotenv').config({ path: dotenvPath });
}

// Import required modules
const { parseArguments } = require('./utils/cli');
const ProxyServer = require('./server');
const config = require('./config/default');
const { logger } = require('./middleware/logger');

/**
 * Main function to handle different execution modes
 */
async function main() {
    try {
        // If no arguments provided, show help
        if (process.argv.length <= 2) {
            const { program } = require('./utils/cli');
            program.help();
            return;
        }

        // Parse CLI arguments
        parseArguments();

    } catch (error) {
        logger.error('Application startup error:', error);
        console.error('Error:', error.message);
        process.exit(1);
    }
}

/**
 * Direct server start function (for programmatic use)
 */
async function startServer(options = {}) {
    try {
        // Validate configuration
        config.validate();

        // Create and start server
        const server = new ProxyServer(options);
        await server.start();

        return server;
    } catch (error) {
        logger.error('Failed to start server programmatically:', error);
        throw error;
    }
}

// Export for programmatic use
module.exports = {
    ProxyServer,
    startServer,
    config
};

// Run CLI if this file is executed directly
if (require.main === module) {
    main().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}
