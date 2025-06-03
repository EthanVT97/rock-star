const { program } = require('commander');
const path = require('path');
const fs = require('fs');
const ProxyServer = require('../server');
const config = require('../config/default');
const { logger } = require('../middleware/logger');

// Package information
const packagePath = path.join(__dirname, '..', 'package.json');
let packageInfo = { version: '1.0.0', description: 'Custom HTTP Proxy Server' };

try {
    if (fs.existsSync(packagePath)) {
        packageInfo = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    }
} catch (error) {
    logger.warn('Could not read package.json:', error.message);
}

// Configure CLI
program
    .name('proxy-server')
    .description(packageInfo.description || 'A configurable HTTP proxy server with logging and forwarding capabilities')
    .version(packageInfo.version || '1.0.0');

// Start command
program
    .command('start')
    .description('Start the proxy server')
    .option('-p, --port <port>', 'Port to listen on', parseInt)
    .option('-h, --host <host>', 'Host to bind to')
    .option('-t, --target <target>', 'Target URL to proxy requests to')
    .option('-c, --config <path>', 'Path to configuration file')
    .option('--log-level <level>', 'Logging level (error, warn, info, debug)')
    .option('--no-log-requests', 'Disable request logging')
    .option('--no-log-responses', 'Disable response logging')
    .option('--timeout <ms>', 'Proxy timeout in milliseconds', parseInt)
    .action(async (options) => {
        try {
            // Override config with CLI options
            const serverConfig = {
                port: options.port || config.server.port,
                host: options.host || config.server.host
            };

            // Update proxy config if provided
            if (options.target) {
                config.proxy.target = options.target;
            }
            if (options.timeout) {
                config.proxy.timeout = options.timeout;
                config.proxy.proxyTimeout = options.timeout;
            }
            if (options.logLevel) {
                config.logging.level = options.logLevel;
            }
            if (options.logRequests === false) {
                config.proxy.logRequests = false;
            }
            if (options.logResponses === false) {
                config.proxy.logResponses = false;
            }

            // Load custom config file if specified
            if (options.config) {
                const customConfigPath = path.resolve(options.config);
                if (fs.existsSync(customConfigPath)) {
                    const customConfig = require(customConfigPath);
                    Object.assign(config, customConfig);
                    logger.info(`Loaded configuration from: ${customConfigPath}`);
                } else {
                    logger.error(`Configuration file not found: ${customConfigPath}`);
                    process.exit(1);
                }
            }

            // Validate configuration
            config.validate();

            // Create and start server
            const server = new ProxyServer(serverConfig);
            await server.start();

            logger.info('Proxy server configuration:', {
                target: config.proxy.target,
                port: serverConfig.port,
                host: serverConfig.host,
                timeout: config.proxy.timeout,
                logRequests: config.proxy.logRequests,
                logResponses: config.proxy.logResponses
            });

        } catch (error) {
            logger.error('Failed to start server:', error.message);
            process.exit(1);
        }
    });

// Config command - show current configuration
program
    .command('config')
    .description('Show current configuration')
    .option('-c, --config <path>', 'Path to configuration file')
    .action((options) => {
        try {
            let currentConfig = { ...config };

            // Load custom config if specified
            if (options.config) {
                const customConfigPath = path.resolve(options.config);
                if (fs.existsSync(customConfigPath)) {
                    const customConfig = require(customConfigPath);
                    currentConfig = { ...currentConfig, ...customConfig };
                } else {
                    console.error(`Configuration file not found: ${customConfigPath}`);
                    process.exit(1);
                }
            }

            console.log('Current Configuration:');
            console.log('=====================');
            console.log(JSON.stringify(currentConfig, null, 2));
        } catch (error) {
            console.error('Error reading configuration:', error.message);
            process.exit(1);
        }
    });

// Test command - test connectivity to target
program
    .command('test')
    .description('Test connectivity to proxy target')
    .option('-t, --target <target>', 'Target URL to test')
    .option('-c, --config <path>', 'Path to configuration file')
    .action(async (options) => {
        const axios = require('axios').default;

        try {
            let targetUrl = options.target || config.proxy.target;

            // Load custom config if specified
            if (options.config) {
                const customConfigPath = path.resolve(options.config);
                if (fs.existsSync(customConfigPath)) {
                    const customConfig = require(customConfigPath);
                    targetUrl = options.target || customConfig.proxy?.target || config.proxy.target;
                }
            }

            console.log(`Testing connectivity to: ${targetUrl}`);
            console.log('========================================');

            const startTime = Date.now();
            
            try {
                const response = await axios.get(targetUrl, {
                    timeout: config.proxy.timeout,
                    validateStatus: () => true // Accept any status code
                });

                const duration = Date.now() - startTime;

                console.log('✅ Connection successful!');
                console.log(`Status: ${response.status} ${response.statusText}`);
                console.log(`Response time: ${duration}ms`);
                console.log(`Content-Type: ${response.headers['content-type'] || 'Not specified'}`);
                
                if (response.headers['content-length']) {
                    console.log(`Content-Length: ${response.headers['content-length']} bytes`);
                }

            } catch (error) {
                const duration = Date.now() - startTime;
                
                console.log('❌ Connection failed!');
                console.log(`Error: ${error.message}`);
                console.log(`Duration: ${duration}ms`);
                
                if (error.code) {
                    console.log(`Error Code: ${error.code}`);
                }
                
                process.exit(1);
            }

        } catch (error) {
            console.error('Test failed:', error.message);
            process.exit(1);
        }
    });

// Generate config command
program
    .command('generate-config')
    .description('Generate a sample configuration file')
    .option('-o, --output <path>', 'Output file path', './proxy-config.js')
    .action((options) => {
        try {
            const configTemplate = `module.exports = {
    server: {
        port: 8000,
        host: '0.0.0.0',
        bodyLimit: '10mb'
    },
    
    proxy: {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        timeout: 30000,
        proxyTimeout: 30000,
        
        headers: {
            'X-Forwarded-Proto': 'http',
            'X-Proxy-By': 'custom-proxy-server'
        },
        
        excludePaths: ['/health', '/stats'],
        
        logRequests: true,
        logResponses: true,
        
        pathRewrite: {
            // '^/api/old': '/api/new'
        },
        
        router: {
            // '/api': 'http://api-server:3000',
            // '/static': 'http://static-server:8080'
        }
    },
    
    logging: {
        level: 'info',
        
        file: {
            enabled: true,
            filename: './logs/proxy.log',
            maxSize: '10m',
            maxFiles: 5
        },
        
        console: {
            enabled: true,
            level: 'info',
            colorize: true
        },
        
        requests: {
            enabled: true,
            includeBody: false,
            includeHeaders: false,
            maxBodyLength: 1000
        }
    }
};`;

            fs.writeFileSync(options.output, configTemplate);
            console.log(`✅ Configuration template generated: ${options.output}`);
            console.log('Edit this file to customize your proxy settings.');

        } catch (error) {
            console.error('Failed to generate config:', error.message);
            process.exit(1);
        }
    });

// Parse CLI arguments
function parseArguments() {
    program.parse();
}

// Export for use in other modules
module.exports = {
    program,
    parseArguments
};
