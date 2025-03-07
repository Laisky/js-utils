import { jest } from '@jest/globals';
// Import only what you need to test
import { escapeHtml, escapeHtmlAttribute, RandomString, sanitizeHTML, TrimSpace } from '../src/index.js';

describe('String utilities', () => {
    describe('escapeHtml', () => {
        test('should escape HTML special characters', () => {
            const result = escapeHtml('<script>alert("Hello & World");</script>');
            expect(result).toBe('&lt;script&gt;alert(&quot;Hello &amp; World&quot;);&lt;/script&gt;');
        });

        test('should handle null and undefined', () => {
            expect(escapeHtml(null)).toBe('');
            expect(escapeHtml(undefined)).toBe('');
        });
    });

    describe('escapeHtmlAttribute', () => {
        test('should escape extended set of characters', () => {
            const result = escapeHtmlAttribute('<a href="test.html" onclick=`alert(1)`>');
            expect(result).toContain('&#x60;alert(1)&#x60;');
        });
    });

    describe('RandomString', () => {
        test('should generate string of specified length', () => {
            const str = RandomString(10);
            expect(str).toHaveLength(10);
            expect(typeof str).toBe('string');
        });

        test('should generate different strings', () => {
            const str1 = RandomString(20);
            const str2 = RandomString(20);
            expect(str1).not.toBe(str2);
        });
    });

    describe('sanitizeHTML', () => {
        test('should sanitize HTML code', () => {
            const html = '<script>alert("XSS")</script>';
            expect(sanitizeHTML(html)).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
        });
    });
});
