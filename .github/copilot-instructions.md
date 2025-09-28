# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

### Sanext Heat Meter Adapter Specifics
This adapter connects to Sanext heat meters via TCP/IP connection to retrieve thermal energy measurement data. The adapter:

- **Primary Function**: Receives data from Sanext heat meters over TCP connection
- **Key Dependencies**: Built-in Node.js `net` module for TCP communication
- **Communication Protocol**: Uses Modbus-like protocol with CRC16 checksums for data validation
- **Data Types**: Retrieves energy consumption, temperatures (inlet/outlet/differential), flow rates, and system diagnostics
- **Configuration Requirements**: IP address, port, polling interval, and serial number for device identification
- **Connection Management**: Implements automatic reconnection logic with 10-second timeout for reliability

#### Key Data Points Retrieved:
- Energy consumption (kWh)
- Inlet temperature (tempIn)
- Outlet temperature (tempOut) 
- Temperature difference (tempDiff)
- Flow rate and volume measurements
- Power consumption
- Impulse inputs (1-4) for additional sensors
- System time and operational hours

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections
- Example test structure:
  ```javascript
  describe('AdapterName', () => {
    let adapter;
    
    beforeEach(() => {
      // Setup test adapter instance
    });
    
    test('should initialize correctly', () => {
      // Test adapter initialization
    });
  });
  ```

### Integration Testing

**IMPORTANT**: Use the official `@iobroker/testing` framework for all integration tests. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation**: https://github.com/ioBroker/testing

#### Framework Structure
Integration tests MUST follow this exact pattern:

```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

// Define test coordinates or configuration
const TEST_COORDINATES = '52.520008,13.404954'; // Berlin
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use tests.integration() with defineAdditionalTests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', function () {
                return new Promise(async (resolve, reject) => {
                    try {
                        harness = getHarness();
                        
                        // Get adapter object using promisified pattern
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) {
                            return reject(new Error('Adapter object not found'));
                        }

                        // Configure adapter properties
                        Object.assign(obj.native, {
                            position: TEST_COORDINATES,
                            createCurrently: true,
                            createHourly: true,
                            createDaily: true,
                            // Add other configuration as needed
                        });

                        // Set the updated configuration
                        harness.objects.setObject(obj._id, obj);

                        console.log('✅ Step 1: Configuration written, starting adapter...');
                        
                        // Start adapter and wait
                        await harness.startAdapterAndWait();
                        
                        console.log('✅ Step 2: Adapter started');

                        // Wait for adapter to process data
                        const waitMs = 15000;
                        await wait(waitMs);

                        console.log('🔍 Step 3: Checking states after adapter run...');
                        
                        // Verify states were created correctly
                        const states = await harness.states.getStatesAsync('your-adapter.0.*');
                        
                        if (Object.keys(states).length === 0) {
                            return reject(new Error('No states created - adapter may not be working correctly'));
                        }

                        console.log(`✅ Step 4: Found ${Object.keys(states).length} states`);
                        resolve();
                        
                    } catch (error) {
                        console.error('❌ Test failed:', error);
                        reject(error);
                    }
                });
            }).timeout(30000);
        });
    }
});
```

#### Test Harness Best Practices

1. **Always use the official harness methods**:
   - `harness.startAdapterAndWait()` - Start adapter and wait for it to be ready
   - `harness.objects.getObjectAsync()` - Get object asynchronously  
   - `harness.states.getStatesAsync()` - Get states asynchronously
   - `harness.changeAdapterConfig()` - Change adapter configuration safely

2. **Configuration management**:
   ```javascript
   // Correct way to configure adapter for testing
   await harness.changeAdapterConfig('your-adapter', {
       native: {
           apiKey: 'test-key',
           interval: 60000,
           enabled: true
       }
   });
   ```

3. **State verification patterns**:
   ```javascript
   // Wait for states to be created
   const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
   await wait(5000);
   
   // Check specific states
   const connectionState = await harness.states.getStateAsync('adapter.0.info.connection');
   expect(connectionState).to.exist;
   expect(connectionState.val).to.be.true;
   ```

4. **Error handling in tests**:
   ```javascript
   it('should handle connection errors gracefully', async function() {
       this.timeout(15000);
       
       await harness.changeAdapterConfig('your-adapter', {
           native: { apiUrl: 'https://invalid-url' }
       });
       
       await harness.startAdapterAndWait();
       await wait(5000);
       
       const connectionState = await harness.states.getStateAsync('adapter.0.info.connection');
       expect(connectionState.val).to.be.false;
   });
   ```

### Sanext TCP Testing Considerations

For the Sanext adapter specifically:
- Mock TCP connections for unit tests using Node.js `net` module mocks
- Test CRC16 checksum calculation independently 
- Verify correct Modbus-like command formatting
- Test reconnection logic with simulated connection failures
- Validate data parsing for different meter response types

## Development Guidelines

### Logging Best Practices

Always use appropriate logging levels:

```javascript
// For debugging protocol communication
this.log.debug(`Sending command: ${Buffer.from(command).toString('hex')}`);

// For normal operation info
this.log.info('Connected to Sanext heat meter at ' + this.config.ip);

// For recoverable errors
this.log.warn('Connection lost, attempting reconnection in 10 seconds');

// For critical errors
this.log.error('Failed to parse response from heat meter: ' + error.message);
```

### State Management

Follow ioBroker state management patterns:

```javascript
// Create states with proper configuration
await this.setObjectNotExistsAsync('energy', {
    type: 'state',
    common: {
        name: 'Energy consumption',
        type: 'number',
        role: 'value.power.consumption',
        unit: 'kWh',
        read: true,
        write: false
    },
    native: {}
});

// Update states with proper type checking
const energyValue = parseFloat(response.readFloatLE(6)).toFixed(4);
await this.setStateAsync('energy', { val: +energyValue, ack: true });
```

### Network Communication (Sanext Specific)

When working with TCP connections for Sanext meters:

```javascript
// Proper connection setup with error handling
connectTCP() {
    this.sanext = net.createConnection(this.config.port, this.config.ip);
    
    this.sanext.on('connect', () => {
        this.log.info('Connected to Sanext meter');
        this.setState('info.connection', true, true);
    });
    
    this.sanext.on('error', (error) => {
        this.log.error('TCP connection error: ' + error.message);
        this.setState('info.connection', false, true);
        this.reconnect();
    });
    
    this.sanext.on('close', () => {
        this.log.warn('Connection closed');
        this.setState('info.connection', false, true);
        this.reconnect();
    });
}

// CRC16 calculation for Modbus protocol
calculateCRC16(data) {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) {
            const odd = crc & 0x0001;
            crc = crc >> 1;
            if (odd) {
                crc = crc ^ 0xA001;
            }
        }
    }
    return crc;
}
```

### Resource Cleanup

Implement proper cleanup in the `unload()` method:

```javascript
unload(callback) {
    try {
        // Clear all timers
        if (this.timeoutPoll) {
            clearTimeout(this.timeoutPoll);
            this.timeoutPoll = null;
        }
        if (this.reconnectTimeOut) {
            clearTimeout(this.reconnectTimeOut);  
            this.reconnectTimeOut = null;
        }
        
        // Close network connections
        if (this.sanext) {
            this.sanext.destroy();
            this.sanext = null;
        }
        
        // Update connection state
        this.setState('info.connection', false, true);
        
        this.log.debug('Adapter cleanup completed');
        callback();
    } catch (error) {
        this.log.error('Error during cleanup: ' + error.message);
        callback();
    }
}
```

## Code Style and Standards

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods

## CI/CD and Testing Integration

### GitHub Actions for API Testing
For adapters with external API dependencies, implement separate CI/CD jobs:

```yaml
# Tests API connectivity with demo credentials (runs separately)
demo-api-tests:
  if: contains(github.event.head_commit.message, '[skip ci]') == false
  
  runs-on: ubuntu-22.04
  
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Use Node.js 20.x
      uses: actions/setup-node@v4
      with:
        node-version: 20.x
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run demo API tests
      run: npm run test:integration-demo
```

### CI/CD Best Practices
- Run credential tests separately from main test suite
- Use ubuntu-22.04 for consistency
- Don't make credential tests required for deployment
- Provide clear failure messages for API connectivity issues
- Use appropriate timeouts for external API calls (120+ seconds)

### Package.json Script Integration
Add dedicated script for credential testing:
```json
{
  "scripts": {
    "test:integration-demo": "mocha test/integration-demo --exit"
  }
}
```

### Practical Example: Complete API Testing Implementation
Here's a complete example based on lessons learned from the Discovergy adapter:

#### test/integration-demo.js
```javascript
const path = require("path");
const { tests } = require("@iobroker/testing");

// Helper function to encrypt password using ioBroker's encryption method
async function encryptPassword(harness, password) {
    const systemConfig = await harness.objects.getObjectAsync("system.config");
    
    if (!systemConfig || !systemConfig.native || !systemConfig.native.secret) {
        throw new Error("Could not retrieve system secret for password encryption");
    }
    
    const secret = systemConfig.native.secret;
    let result = '';
    for (let i = 0; i < password.length; ++i) {
        result += String.fromCharCode(secret[i % secret.length].charCodeAt(0) ^ password.charCodeAt(i));
    }
    
    return result;
}

// Run integration tests with demo credentials
tests.integration(path.join(__dirname, ".."), {
    defineAdditionalTests({ suite }) {
        suite("API Testing with Demo Credentials", (getHarness) => {
            let harness;
            
            before(() => {
                harness = getHarness();
            });

            it("Should connect to API and initialize with demo credentials", async () => {
                console.log("Setting up demo credentials...");
                
                if (harness.isAdapterRunning()) {
                    await harness.stopAdapter();
                }
                
                const encryptedPassword = await encryptPassword(harness, "demo_password");
                
                await harness.changeAdapterConfig("your-adapter", {
                    native: {
                        username: "demo@provider.com",
                        password: encryptedPassword,
                        // other config options
                    }
                });

                console.log("Starting adapter with demo credentials...");
                await harness.startAdapter();
                
                // Wait for API calls and initialization
                await new Promise(resolve => setTimeout(resolve, 60000));
                
                const connectionState = await harness.states.getStateAsync("your-adapter.0.info.connection");
                
                if (connectionState && connectionState.val === true) {
                    console.log("✅ SUCCESS: API connection established");
                    return true;
                } else {
                    throw new Error("API Test Failed: Expected API connection to be established with demo credentials. " +
                        "Check logs above for specific API errors (DNS resolution, 401 Unauthorized, network issues, etc.)");
                }
            }).timeout(120000);
        });
    }
});
```

## Advanced Patterns

### TypeScript Support
When using TypeScript in ioBroker adapters:

```typescript
import { Adapter } from '@iobroker/adapter-core';

interface SanextConfig {
    ip: string;
    port: number;
    pollingtime: number;
    sn: string;
}

class SanextAdapter extends Adapter {
    private config: SanextConfig;
    private connectionTimer?: NodeJS.Timeout;
    
    constructor(options: Partial<AdapterOptions> = {}) {
        super({
            ...options,
            name: 'sanext',
        });
    }
    
    public async onReady(): Promise<void> {
        this.config = this.config as SanextConfig;
        await this.initializeConnection();
    }
}
```

### Configuration Validation
Implement robust configuration validation:

```javascript
validateConfig() {
    const errors = [];
    
    if (!this.config.ip || !this.config.ip.trim()) {
        errors.push('IP address is required');
    }
    
    if (!this.config.port || this.config.port < 1 || this.config.port > 65535) {
        errors.push('Valid port number (1-65535) is required');
    }
    
    if (!this.config.pollingtime || this.config.pollingtime < 500) {
        errors.push('Polling time must be at least 500ms');
    }
    
    if (errors.length > 0) {
        this.log.error('Configuration validation failed: ' + errors.join(', '));
        return false;
    }
    
    return true;
}
```

### Error Recovery Patterns
Implement robust error recovery for network-based adapters:

```javascript
async attemptReconnection(maxRetries = 5, currentAttempt = 1) {
    if (currentAttempt > maxRetries) {
        this.log.error(`Failed to reconnect after ${maxRetries} attempts`);
        return false;
    }
    
    this.log.info(`Reconnection attempt ${currentAttempt}/${maxRetries}`);
    
    try {
        await this.connectTCP();
        this.log.info('Reconnection successful');
        return true;
    } catch (error) {
        this.log.warn(`Reconnection attempt ${currentAttempt} failed: ${error.message}`);
        
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, currentAttempt - 1), 30000);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this.attemptReconnection(maxRetries, currentAttempt + 1);
    }
}
```

## Performance Considerations

### Memory Management
- Avoid memory leaks by properly cleaning up event listeners
- Use object pooling for frequently created objects
- Monitor memory usage in long-running operations

### Network Optimization for Sanext
- Implement connection pooling for multiple meter connections
- Use appropriate timeouts to prevent hanging connections
- Buffer data efficiently to minimize TCP overhead

```javascript
// Efficient data buffering
class DataBuffer {
    constructor() {
        this.buffer = Buffer.alloc(0);
    }
    
    append(data) {
        this.buffer = Buffer.concat([this.buffer, data]);
    }
    
    consume(length) {
        if (this.buffer.length < length) return null;
        
        const result = this.buffer.slice(0, length);
        this.buffer = this.buffer.slice(length);
        return result;
    }
    
    clear() {
        this.buffer = Buffer.alloc(0);
    }
}
```

## Security Best Practices

### Input Validation
Always validate and sanitize inputs, especially from network sources:

```javascript
validateMeterResponse(response) {
    if (!Buffer.isBuffer(response)) {
        throw new Error('Response must be a Buffer');
    }
    
    if (response.length < 10) {
        throw new Error('Response too short');
    }
    
    // Validate CRC
    const receivedCRC = response.readUInt16LE(response.length - 2);
    const calculatedCRC = this.calculateCRC16(response.slice(0, -2));
    
    if (receivedCRC !== calculatedCRC) {
        throw new Error('CRC validation failed');
    }
    
    return true;
}
```

### Error Information Disclosure
Be careful not to expose sensitive information in error messages:

```javascript
// Good - generic error message
this.log.error('Authentication failed');

// Bad - exposes internal details
this.log.error('Authentication failed: invalid API key xyz123');
```

This comprehensive guide should help GitHub Copilot provide more accurate and contextually appropriate suggestions for ioBroker adapter development, with specific focus on the Sanext heat meter adapter's TCP communication requirements.