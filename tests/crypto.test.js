import { jest } from '@jest/globals';
import { SHA256, hex2Bytes, hex2Blob } from '../src/index.js';

// Import the mocked module directly (no jest.mock call)
import { sha256 } from './__mocks__/js-sha256.js';

describe('Crypto utilities', () => {
    describe('SHA256', () => {
        let originalCrypto;

        beforeEach(() => {
            // Store original crypto
            originalCrypto = global.crypto;
            // Reset mock counts
            sha256.mockClear();
        });

        afterEach(() => {
            // Restore original crypto
            global.crypto = originalCrypto;
        });

        test('should use Web Crypto API when available', async () => {
            if (!crypto.subtle || !crypto.subtle.digest) {
                // If Web Crypto is not available, skip this test
                console.log('Web Crypto API not available. Skipping test.');
                return;
            }

            // Create a buffer with predictable bytes
            const mockBuffer = new Uint8Array([1, 2, 3, 4]).buffer;

            // Mock crypto.subtle
            global.crypto = {
                subtle: {
                    digest: jest.fn().mockResolvedValue(mockBuffer)
                }
            };

            const result = await SHA256('test');
            expect(crypto.subtle.digest).toHaveBeenCalledWith(
                'SHA-256',
                expect.any(Uint8Array)
            );
            expect(result).toBe('01020304');
        });

        test('should fall back to js-sha256 when Web Crypto not available', async () => {
            // Mock implementation of SHA256 to force the use of mocked sha256
            const originalSHA256 = global.crypto;
            global.crypto = undefined;

            const result = await SHA256('test');

            // Check if our mock was called
            expect(sha256).toHaveBeenCalledWith('test');
            expect(result).toBe('mockedHash');

            // Restore original
            global.crypto = originalSHA256;
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
