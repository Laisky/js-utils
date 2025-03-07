import { jest } from '@jest/globals';
import { Compatible, Sleep, TrimSpace, formatRelativeTime } from '../src/index.js';

describe('Basic utilities', () => {
    describe('Compatible', () => {
        test('should detect compatible objects', () => {
            const objNew = { a: 1, b: { c: 2 } };
            const objOld = { a: 1, b: { c: 2, d: 3 }, e: 4 };
            expect(Compatible(objNew, objOld)).toBe(true);
        });

        test('should detect incompatible objects', () => {
            const objNew = { a: 1, b: { c: 3 } };
            const objOld = { a: 1, b: { c: 2 } };
            expect(Compatible(objNew, objOld)).toBe(false);
        });
    });

    describe('Sleep', () => {
        test('should wait for specified time', async () => {
            const start = Date.now();
            await Sleep(100);
            const elapsed = Date.now() - start;
            expect(elapsed).toBeGreaterThanOrEqual(90);
        });
    });

    describe('TrimSpace', () => {
        test('should trim whitespace from string', () => {
            expect(TrimSpace('  hello  ')).toBe('hello');
            expect(TrimSpace('\n\nhello\n\n')).toBe('hello');
        });
    });

    describe('formatRelativeTime', () => {
        beforeEach(() => {
            jest.useFakeTimers().setSystemTime(new Date('2023-01-15T12:00:00Z'));
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('should format time differences properly', () => {
            expect(formatRelativeTime('2023-01-15T11:59:01Z')).toBe('just now');
            expect(formatRelativeTime('2023-01-15T11:58:00Z')).toBe('2 minutes ago');
            expect(formatRelativeTime('2023-01-15T10:00:00Z')).toBe('2 hours ago');
            expect(formatRelativeTime('2023-01-14T12:00:00Z')).toBe('1 day ago');
            expect(formatRelativeTime('2022-12-15T12:00:00Z')).toBe('1 month ago');
            expect(formatRelativeTime('2022-01-15T12:00:00Z')).toBe('1 year ago');
        });
    });
});
