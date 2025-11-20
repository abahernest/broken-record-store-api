import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { RetryService, ApiRetryConfig } from './retry.service';

describe('RetryService', () => {
  let service: RetryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RetryService],
    }).compile();

    service = module.get<RetryService>(RetryService);
  });

  describe('executeWithRetry', () => {
    it('should execute operation successfully on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const result = await service.executeWithRetry(operation, 'TestService');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient network errors', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce({ code: 'ECONNRESET' })
        .mockResolvedValueOnce('success');

      const result = await service.executeWithRetry(operation, 'TestService');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on timeout errors', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockResolvedValueOnce('success');

      const result = await service.executeWithRetry(operation, 'TestService');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on HTTP 503 Service Unavailable', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce({
          response: { status: 503 },
        })
        .mockResolvedValueOnce('success');

      const result = await service.executeWithRetry(operation, 'TestService');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on HTTP 502 Bad Gateway', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce({
          response: { status: 502 },
        })
        .mockResolvedValueOnce('success');

      const result = await service.executeWithRetry(operation, 'TestService');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on HTTP 429 Too Many Requests', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce({
          response: { status: 429 },
        })
        .mockResolvedValueOnce('success');

      const result = await service.executeWithRetry(operation, 'TestService');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable HTTP errors (400)', async () => {
      const operation = jest.fn().mockRejectedValue({
        response: { status: 400, data: { message: 'Bad Request' } },
      });

      await expect(
        service.executeWithRetry(operation, 'TestService'),
      ).rejects.toThrow(HttpException);

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should not retry on non-retryable HTTP errors (401)', async () => {
      const operation = jest.fn().mockRejectedValue({
        response: { status: 401, data: { message: 'Unauthorized' } },
      });

      await expect(
        service.executeWithRetry(operation, 'TestService'),
      ).rejects.toThrow(HttpException);

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should not retry on non-retryable HTTP errors (403)', async () => {
      const operation = jest.fn().mockRejectedValue({
        response: { status: 403, data: { message: 'Forbidden' } },
      });

      await expect(
        service.executeWithRetry(operation, 'TestService'),
      ).rejects.toThrow(HttpException);

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should not retry on non-retryable HTTP errors (404)', async () => {
      const operation = jest.fn().mockRejectedValue({
        response: { status: 404, data: { message: 'Not Found' } },
      });

      await expect(
        service.executeWithRetry(operation, 'TestService'),
      ).rejects.toThrow(HttpException);

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should exhaust retries and throw on persistent failures', async () => {
      const operation = jest.fn().mockRejectedValue({ code: 'ECONNRESET' });

      await expect(
        service.executeWithRetry(operation, 'TestService'),
      ).rejects.toThrow(HttpException);

      expect(operation).toHaveBeenCalledTimes(3); // default maxAttempts
    });

    it('should respect custom maxAttempts configuration', async () => {
      const operation = jest.fn().mockRejectedValue({ code: 'ECONNRESET' });

      const config: ApiRetryConfig = { maxAttempts: 2 };

      await expect(
        service.executeWithRetry(operation, 'TestService', config),
      ).rejects.toThrow(HttpException);

      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should throw HttpException with service name in response', async () => {
      const operation = jest
        .fn()
        .mockRejectedValue(new Error('Connection failed'));

      try {
        await service.executeWithRetry(operation, 'CustomService');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = error.getResponse() as any;
        expect(response.service).toBe('CustomService');
      }
    });

    it('should handle timeout message in error', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Request timeout'))
        .mockResolvedValueOnce('success');

      const result = await service.executeWithRetry(operation, 'TestService');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on EHOSTUNREACH error', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce({ code: 'EHOSTUNREACH' })
        .mockResolvedValueOnce('success');

      const result = await service.executeWithRetry(operation, 'TestService');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on ENETUNREACH error', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce({ code: 'ENETUNREACH' })
        .mockResolvedValueOnce('success');

      const result = await service.executeWithRetry(operation, 'TestService');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on ENOTFOUND error', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce({ code: 'ENOTFOUND' })
        .mockResolvedValueOnce('success');

      const result = await service.executeWithRetry(operation, 'TestService');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should return correct status code for connection refused', async () => {
      const operation = jest.fn().mockRejectedValue({ code: 'ECONNREFUSED' });

      try {
        await service.executeWithRetry(operation, 'TestService');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      }
    });

    it('should return correct status code for timeout', async () => {
      const operation = jest.fn().mockRejectedValue({ code: 'ETIMEDOUT' });

      try {
        await service.executeWithRetry(operation, 'TestService');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      }
    });

    it('should preserve original HTTP status codes when available', async () => {
      const operation = jest.fn().mockRejectedValue({
        response: { status: 429, data: { message: 'Rate limited' } },
      });

      try {
        await service.executeWithRetry(operation, 'TestService');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        // After exhausting retries, should preserve the original status
        expect(error.getStatus()).toBe(429);
      }
    });

    it('should handle multiple retries with partial failures', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce({ code: 'ECONNRESET' })
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockResolvedValueOnce('success');

      const result = await service.executeWithRetry(operation, 'TestService');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should handle HttpException thrown from operation', async () => {
      // Create a mock error that looks like an axios error with 503 status
      const httpError = {
        response: {
          status: 503,
          data: { message: 'Service Error' },
        },
      };
      const operation = jest
        .fn()
        .mockRejectedValueOnce(httpError)
        .mockResolvedValueOnce('success');

      const result = await service.executeWithRetry(operation, 'TestService');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('error message extraction', () => {
    it('should extract error message from HttpException', async () => {
      const operation = jest
        .fn()
        .mockRejectedValue(
          new HttpException('Custom error', HttpStatus.BAD_REQUEST),
        );

      try {
        await service.executeWithRetry(operation, 'TestService');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
      }

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should extract error message from response data', async () => {
      const operation = jest.fn().mockRejectedValue({
        response: {
          status: 400,
          data: { message: 'Invalid input' },
        },
      });

      try {
        await service.executeWithRetry(operation, 'TestService');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
      }

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle error object with message property', async () => {
      const operation = jest
        .fn()
        .mockRejectedValue(new Error('Database connection failed'));

      try {
        await service.executeWithRetry(operation, 'TestService');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
      }

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle string error', async () => {
      const operation = jest.fn().mockRejectedValue('String error message');

      try {
        await service.executeWithRetry(operation, 'TestService');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
      }

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle unknown error format', async () => {
      const operation = jest
        .fn()
        .mockRejectedValue({ unknown: 'error format' });

      try {
        await service.executeWithRetry(operation, 'TestService');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
      }

      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('default configuration', () => {
    it('should use default maxAttempts of 3', async () => {
      const operation = jest.fn().mockRejectedValue({ code: 'ECONNRESET' });

      try {
        await service.executeWithRetry(operation, 'TestService');
      } catch (error) {
        // Expected
      }

      expect(operation).toHaveBeenCalledTimes(3);
    });
  });
});
