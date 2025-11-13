const mongoose = require('mongoose');

const connections = {};
const maxRetries = 3;
const retryDelay = 5000; // 5 seconds

function getConnection(name, uri) {
    if (!connections[name]) {
        let retryCount = 0;
        
        const connectWithRetry = () => {
            connections[name] = mongoose.createConnection(uri, {
                // Connection options
                connectTimeoutMS: 60000, // 60 seconds
                socketTimeoutMS: 60000,   // 60 seconds
                serverSelectionTimeoutMS: 60000, // 60 seconds
                maxPoolSize: 10, // Maintain up to 10 socket connections
                bufferCommands: true // Enable mongoose buffering to prevent errors when connection is not ready
            });
            
            // Add connection event listeners
            connections[name].on('connected', () => {
                console.log(`Connected to ${name} database`);
                retryCount = 0; // Reset retry count on successful connection
            });
            
            connections[name].on('error', (err) => {
                console.error(`Error connecting to ${name} database:`, err);
                
                // Implement retry logic
                if (retryCount < maxRetries) {
                    retryCount++;
                    console.log(`Retrying connection to ${name} database (${retryCount}/${maxRetries}) in ${retryDelay/1000} seconds...`);
                    
                    // Close current connection before retry
                    if (connections[name].readyState !== 0) {
                        connections[name].close();
                    }
                    
                    // Retry after delay
                    setTimeout(connectWithRetry, retryDelay);
                } else {
                    console.error(`Max retries (${maxRetries}) reached for ${name} database. Giving up.`);
                }
            });
            
            connections[name].on('disconnected', () => {
                console.log(`Disconnected from ${name} database`);
                
                // Attempt to reconnect after disconnection
                if (retryCount < maxRetries) {
                    console.log(`Attempting to reconnect to ${name} database...`);
                    setTimeout(connectWithRetry, retryDelay);
                }
            });
        };
        
        // Start the connection process
        connectWithRetry();
    }
    return connections[name];
}

module.exports = { getConnection };
