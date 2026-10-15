/**
 * Autonomous Circuit Breaker Engine
 * Prevents cascading server hangs & Render timeouts when external services (Telegram DC / APIs) experience outages.
 */

const CircuitState = {
  CLOSED: "CLOSED",       // Normal: Traffic flows to service
  OPEN: "OPEN",           // Tripped: Fast-fails to prevent server hang
  HALF_OPEN: "HALF_OPEN", // Probing: Testing recovery
};

class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || "DefaultService";
    this.failureThreshold = options.failureThreshold || 5; // Trip after 5 failures
    this.resetTimeoutMs = options.resetTimeoutMs || 45000;  // 45 seconds before probing recovery
    this.state = CircuitState.CLOSED;
    this.consecutiveFailures = 0;
    this.lastStateChange = Date.now();
    this.successfulProbes = 0;
  }

  async execute(actionFn, fallbackFn) {
    const now = Date.now();

    // Check if OPEN circuit should transition to HALF_OPEN
    if (this.state === CircuitState.OPEN) {
      if (now - this.lastStateChange > this.resetTimeoutMs) {
        this.state = CircuitState.HALF_OPEN;
        this.lastStateChange = now;
        console.log(`[CIRCUIT-BREAKER:${this.name}] 🟡 Circuit transitioned to HALF-OPEN (Testing probe request)...`);
      } else {
        // Fast-fail immediately without hanging student request
        console.warn(`[CIRCUIT-BREAKER:${this.name}] ⚡ Fast-failing request (Circuit is OPEN). Serving fallback...`);
        if (typeof fallbackFn === "function") {
          return await fallbackFn(new Error(`Service ${this.name} temporarily unavailable (Circuit OPEN).`));
        }
        throw new Error(`Service ${this.name} circuit is OPEN. Please retry in a moment.`);
      }
    }

    try {
      const result = await actionFn();

      // Successful execution: handle state recovery
      if (this.state === CircuitState.HALF_OPEN) {
        this.successfulProbes++;
        if (this.successfulProbes >= 2) {
          this.state = CircuitState.CLOSED;
          this.consecutiveFailures = 0;
          this.successfulProbes = 0;
          this.lastStateChange = now;
          console.log(`[CIRCUIT-BREAKER:${this.name}] 🟢 Circuit restored to CLOSED (Service healthy).`);
        }
      } else if (this.state === CircuitState.CLOSED) {
        this.consecutiveFailures = 0;
      }

      return result;
    } catch (err) {
      this.consecutiveFailures++;

      if (this.state === CircuitState.HALF_OPEN || this.consecutiveFailures >= this.failureThreshold) {
        this.state = CircuitState.OPEN;
        this.lastStateChange = now;
        this.successfulProbes = 0;
        console.error(`[CIRCUIT-BREAKER:${this.name}] 🔴 Circuit TRIPPED to OPEN (${this.consecutiveFailures} consecutive failures). Protecting server from cascading freeze for ${this.resetTimeoutMs / 1000}s.`);
      }

      if (typeof fallbackFn === "function") {
        return await fallbackFn(err);
      }
      throw err;
    }
  }

  getStatus() {
    return {
      name: this.name,
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      lastStateChange: new Date(this.lastStateChange).toISOString(),
    };
  }
}

// Global Breaker instances
const telegramCircuitBreaker = new CircuitBreaker({
  name: "TelegramDC5",
  failureThreshold: 5,
  resetTimeoutMs: 45000,
});

module.exports = {
  CircuitBreaker,
  CircuitState,
  telegramCircuitBreaker,
};
