/**
 * Circuit Breaker Chaos Test Script
 * 
 * Run: npx ts-node test/chaos-circuit-breaker.ts
 * 
 * This script verifies the IntegrationGateway circuit breaker behavior:
 * 1. Calls fail 5 times (circuit in CLOSED state)
 * 2. Call 6+ should use FALLBACK instantly (circuit OPEN)
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CircuitBreaker = require('opossum');

// Simulate the gateway configuration (same as integration.gateway.ts)
const defaultOptions = {
    timeout: 1000, // 1 second for faster testing
    errorThresholdPercentage: 50,
    resetTimeout: 5000, // 5 seconds for faster testing
    volumeThreshold: 5, // Min 5 requests before calculating error %
    rollingCountTimeout: 10000,
    rollingCountBuckets: 10,
};

// Simulated AI call that ALWAYS fails (chaos mode)
async function failingAICall(): Promise<string> {
    throw new Error('Simulated network outage');
}

// Fallback when circuit is open
function fallbackResponse(): string {
    return 'AI analysis unavailable at the moment.';
}

async function runChaosTest() {
    console.log('🔥 CIRCUIT BREAKER CHAOS TEST');
    console.log('=============================\n');

    const breaker = new CircuitBreaker(failingAICall, defaultOptions);

    // Register fallback
    breaker.fallback(fallbackResponse);

    // Event listeners
    breaker.on('open', () => console.log('\n🔴 CIRCUIT OPENED - Requests will fail fast!\n'));
    breaker.on('halfOpen', () => console.log('🟡 Circuit half-open - testing recovery...'));
    breaker.on('close', () => console.log('🟢 Circuit closed - recovered'));
    breaker.on('fallback', () => console.log('   ↩️  Fallback triggered'));

    // Make 10 calls
    for (let i = 1; i <= 10; i++) {
        const start = Date.now();
        try {
            const result = await breaker.fire();
            const latency = Date.now() - start;
            console.log(`[Call ${i}] Result: "${result}" (${latency}ms)`);
        } catch (error) {
            const latency = Date.now() - start;
            console.log(`[Call ${i}] ❌ Error: ${(error as Error).message} (${latency}ms)`);
        }
    }

    console.log('\n=============================');
    console.log('Circuit State:', breaker.opened ? 'OPEN' : 'CLOSED');
    console.log('Stats:', {
        failures: breaker.stats.failures,
        successes: breaker.stats.successes,
        fallbacks: breaker.stats.fallbacks,
    });

    // Cleanup
    breaker.shutdown();
}

runChaosTest().catch(console.error);
