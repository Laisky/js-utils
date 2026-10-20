import { jest } from '@jest/globals';
import { SHA256, hex2Bytes, hex2Blob } from '../src/index.js';

// Import the mocked module directly (no jest.mock call)
import { sha256 } from './__mocks__/js-sha256.js';

describe('Crypto utilities', () => {
    describe('SHA256', () => {
        let originalCryptoDescriptor;

        beforeEach(() => {
            // Store original crypto
            originalCryptoDescriptor = Object.getOwnPropertyDescriptor(global, 'crypto');
            // Reset mock counts
            sha256.mockClear();
        });

        afterEach(() => {
            // Restore original crypto
            Object.defineProperty(global, 'crypto', originalCryptoDescriptor);
        });

        test('should use Web Crypto API when available', async () => {
            // Create a buffer with predictable bytes
            const mockBuffer = new Uint8Array([1, 2, 3, 4]).buffer;

            // Mock crypto.subtle
            Object.defineProperty(global, 'crypto', {
                configurable: true,
                value: {
                    subtle: {
                        digest: jest.fn().mockResolvedValue(mockBuffer)
                    }
                }
            });

            const result = await SHA256('test');
            expect(crypto.subtle.digest).toHaveBeenCalledWith(
                'SHA-256',
                expect.any(Uint8Array)
            );
            expect(result).toBe('01020304');
        });

        test('should fall back to js-sha256 when Web Crypto not available', async () => {
            // Mock implementation of SHA256 to force the use of mocked sha256
            Object.defineProperty(global, 'crypto', {
                configurable: true,
                value: undefined
            });

            const result = await SHA256('test');

            // Check if our mock was called
            expect(sha256).toHaveBeenCalledWith('test');
            expect(result).toBe('mockedHash');

        });
    });

    describe('hex conversions', () => {
        test('hex2Bytes should convert hex string to bytes', () => {
            const bytes = hex2Bytes('0102');
            expect(bytes).toEqual(new Uint8Array([1, 2]));
        });

        test('hex2Blob should convert hex string to blob', () => {
            const blob = hex2Blob('0102');
            expect(blob).toBeInstanceOf(Blob);
            expect(blob.size).toBe(2);
        });
    });
});
