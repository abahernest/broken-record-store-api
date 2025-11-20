import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';

/**
 * Configuration options for third-party API retry behavior
 */
export interface ApiRetryConfig {
  maxAttempts?: number; // (default: 3)

  maxDuration?: number; // (default: 30000)
}

/**
 * Retry Service for Third-Party APIs
 * Handles transient failures when connecting to third-party services
 * with exponential backoff and automatic retry on common network/HTTP errors
 */
@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);

  private readonly defaultConfig: Required<ApiRetryConfig> = {
    maxAttempts: 3,
    maxDuration: 30000,
  };

  /**
   * Executes an async API call with automatic retry on transient failures
   * Uses exponential backoff with jitter to space out retry attempts
   * @param operation - Async function that makes the API call
   * @param serviceName - Name of the third-party service for logging
   * @param config - Retry configuration options
   * @returns The result data from the operation
   * @throws HttpException if all retries are exhausted or operation fails with non-retryable error
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    serviceName: string,
    config?: ApiRetryConfig,
  ): Promise<T> {
    const finalConfig = this.mergeConfig(config);
    const startTime = Date.now();
    let lastError: any;

    for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
      try {
        this.logger.debug(
          `[${serviceName}] API call attempt ${attempt}/${finalConfig.maxAttempts}`,
        );

        const data = await operation();

        this.logger.log(
          `[${serviceName}] API call succeeded on attempt ${attempt}`,
        );
        return data;
      } catch (error) {
        lastError = error;
        const errorMessage = this.getErrorMessage(error);
        const isRetryable = this.isRetryableError(error);

        // If non-retryable error or last attempt, throw immediately
        if (!isRetryable || attempt === finalConfig.maxAttempts) {
          this.logger.error(
            `[${serviceName}] API call failed - ${isRetryable ? 'max retries exhausted' : 'non-retryable error'}`,
            errorMessage,
          );
          throw this.createHttpException(error, serviceName);
        }

        // Calculate delay for next attempt
        const elapsedTime = Date.now() - startTime;
        const delay = this.calculateDelay(
          attempt,
          finalConfig.maxDuration - elapsedTime,
        );

        if (delay <= 0) {
          this.logger.error(
            `[${serviceName}] Max duration exceeded`,
            errorMessage,
          );
          throw this.createHttpException(error, serviceName);
        }

        this.logger.warn(
          `[${serviceName}] Attempt ${attempt} failed: ${errorMessage}. Retrying in ${delay}ms...`,
        );

        await this.sleep(delay);
      }
    }

    throw this.createHttpException(lastError, serviceName);
  }

  private isRetryableError(error: any): boolean {
    // Network and timeout errors
    if (error.code) {
      const retryableCodes = [
        'ECONNREFUSED',
        'ECONNRESET',
        'ETIMEDOUT',
        'EHOSTUNREACH',
        'ENETUNREACH',
        'ENOTFOUND',
      ];
      if (retryableCodes.includes(error.code)) {
        return true;
      }
    }

    // HTTP errors
    if (error.response?.status) {
      const retryableStatuses = [408, 429, 502, 503, 504];
      if (retryableStatuses.includes(error.response.status)) {
        return true;
      }
    }

    // Timeout errors in message
    if (error.message?.toLowerCase().includes('timeout')) {
      return true;
    }

    return false;
  }

  private calculateDelay(attempt: number, remainingDuration: number): number {
    // Exponential backoff: 1000 * (2 ^ (attempt - 1))
    let delay = 1000 * Math.pow(2, attempt - 1);

    // Add jitter (±10% of delay)
    const jitter = Math.random() * delay * 0.1;
    delay += jitter;

    // Cap at 10 seconds per attempt
    delay = Math.min(delay, 10000);

    // Ensure we don't exceed remaining duration
    if (delay > remainingDuration) {
      return Math.max(0, remainingDuration);
    }

    return Math.floor(delay);
  }

  // Merges provided config with default config
  private mergeConfig(config?: ApiRetryConfig): Required<ApiRetryConfig> {
    return {
      maxAttempts: config?.maxAttempts ?? this.defaultConfig.maxAttempts,
      maxDuration: config?.maxDuration ?? this.defaultConfig.maxDuration,
    };
  }

  // Extracts error message from various error types
  private getErrorMessage(error: any): string {
    if (error instanceof HttpException) {
      return error.message;
    }

    if (error.response?.data?.message) {
      return error.response.data.message;
    }

    if (error.message) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    return 'Unknown error occurred';
  }

  // Creates an HttpException from the original error
  private createHttpException(error: any, serviceName: string): HttpException {
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    const message = `Failed to connect to ${serviceName}`;

    // Preserve original HTTP status if available
    if (error.response?.status) {
      statusCode = error.response.status;
    } else if (
      error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'EHOSTUNREACH'
    ) {
      statusCode = HttpStatus.SERVICE_UNAVAILABLE;
    }

    return new HttpException(
      {
        statusCode,
        message,
        service: serviceName,
      },
      statusCode,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
