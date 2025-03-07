'use strict';

import { marked } from 'marked';
import { sha256 } from 'js-sha256';
import * as bootstrap from 'bootstrap';

import * as base from './base';
import * as kvUtils from './kv';


/**
 * load js modules by urls
 *
 * @param {*} moduleUrls array of module urls
 * @param {*} moduleType script type, default is 'text/javascript'
 */
export const LoadJsModules = async (moduleUrls, moduleType) => {
    moduleType = moduleType || 'text/javascript';
    const promises = moduleUrls.map((moduleUrl) => {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = moduleUrl;
            script.type = moduleType;
            script.async = false;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    });

    await Promise.all(promises);
};

/**
 * check whether objParent is a super set of obj
 *
 * @param {Object} objParent
 * @param {Object} obj
 * @returns true if every property in objNew also exists in objOld
 */
export const Compatible = (objNew, objOld) => {
    // Handle null/undefined
    if (objNew === null || objOld === null) return false;
    if (typeof objNew !== 'object') return objNew === objOld;

    // Handle arrays
    if (Array.isArray(objNew)) {
        if (!Array.isArray(objOld)) return false;
        if (objNew.length > objOld.length) return false;

        // Fix: Check each element
        for (let i = 0; i < objNew.length; i++) {
            if (!Compatible(objNew[i], objOld[i])) return false;
        }

        return true;
    }

    // Check all properties in objNew exist in objOld
    return Object.keys(objNew).every(key => {
        if (!(key in objOld)) return false;
        return Compatible(objNew[key], objOld[key]);
    });
};

/**
 * async wait for milliseconds
 *
 * @param {*} milliseconds
 * @returns
 */
export const Sleep = async (milliseconds) => {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
};

export const ActiveElementsByID = (elements, id) => {
    for (let i = 0; i < elements.length; i++) {
        const item = elements[i];
        if (item.id === id) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    }
};

export const ActiveElementsByData = (elements, dataKey, dataVal) => {
    for (let i = 0; i < elements.length; i++) {
        const item = elements[i];
        if (item.dataset[dataKey] === dataVal) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    }
};

/**
 * get current date string
 *
 * @returns {str} date string
 */
export const DateStr = () => {
    const now = new Date();

    const year = now.getUTCFullYear();
    let month = now.getUTCMonth() + 1;
    let day = now.getUTCDate();
    let hours = now.getUTCHours();
    let minutes = now.getUTCMinutes();
    let seconds = now.getUTCSeconds();

    // Pad the month, day, hours, minutes and seconds with leading zeros, if required
    month = (month < 10 ? '0' : '') + month;
    day = (day < 10 ? '0' : '') + day;
    hours = (hours < 10 ? '0' : '') + hours;
    minutes = (minutes < 10 ? '0' : '') + minutes;
    seconds = (seconds < 10 ? '0' : '') + seconds;

    // Compose the date string
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
};


/**
 * render markdown to html
 *
 * @param {str} markdownString -
 * @returns
 */
export const Markdown2HTML = async (markdownString) => {
    // if (!marked) {
    //     futures = [];
    //     futures.push(LoadJsModules([
    //         'https://s3.laisky.com/static/mermaid/10.9.0/dist/mermaid.min.js',
    //         'https://s3.laisky.com/static/mathjax/2.7.3/MathJax-2.7.3/MathJax.js?config=TeX-MML-AM_CHTML'
    //     ]));

    //     futures.push((async() => {
    //         marked = await import('https://s3.laisky.com/static/marked/12.0.1/lib/marked.umd.js');
    //     })())

    //     await Promise.all(futures);
    // }

    const renderer = new marked.Renderer();

    renderer.code = (code, language) => {
        code = sanitizeHTML(code);
        if (code.match(/^sequenceDiagram/) || code.match(/^graph/)) {
            return `<pre class="mermaid">${code}</pre>`;
        }
        return `<pre class="language-${language}"><code class="language-${language}">${code}</code></pre>`;
    };

    // Add custom tokenizers for math
    marked.use({
        extensions: [{
            name: 'math',
            level: 'inline',
            start(src) {
                return src.match(/\\\[|\\\(|\$\$|\$/)?.index;
            },
            tokenizer(src) {
                // Display math \[...\] or $$...$$
                const displayMatch = src.match(/^\\\[([\s\S]*?)\\\]/) || src.match(/^\$\$([\s\S]*?)\$\$/);
                if (displayMatch) {
                    return {
                        type: 'math',
                        raw: displayMatch[0],
                        text: displayMatch[1],
                        display: true
                    };
                }

                // Inline math \(...\) or $...$
                const inlineMatch = src.match(/^\\\(([\s\S]*?)\\\)/) || src.match(/^\$([\s\S]*?)\$/);
                if (inlineMatch) {
                    return {
                        type: 'math',
                        raw: inlineMatch[0],
                        text: inlineMatch[1],
                        display: false
                    };
                }
            },
            renderer(token) {
                if (token.display) {
                    return `<span class="mathjax-display">\\[${token.text}\\]</span>`;
                }
                return `<span class="mathjax-inline">\\(${token.text}\\)</span>`;
            }
        }]
    });

    marked.use({ renderer });
    const html = marked.parse(markdownString);

    return html;
};

/**
 * scroll to bottom of element
 * @param {HTMLElement} element - element to scroll
 */
export const ScrollDown = (element) => {
    element.scrollTo({
        top: element.scrollHeight,
        left: 0,
        behavior: 'smooth' // 可加入平滑过渡效果
    });
};

export const TrimSpace = (str) => {
    return str.replace(/^[\s\n]+|[\s\n]+$/g, '');
};

export const RenderStr2HTML = (str) => {
    return str.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br/>')
        .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
};

export const getSHA1 = async (str) => {
    // http do not support crypto
    if (!crypto || !crypto.subtle) { // http do not support crypto
        return window.sha1(str);
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hash = await crypto.subtle.digest('SHA-1', data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
};

export const SHA256 = async (str) => {
    // http do not support crypto
    if (!crypto || !crypto.subtle) { // http do not support crypto
        return sha256(str);
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
};

/**
 * Check if the document is ready and execute the callback function
 *
 * @param {function} [callback] - Optional callback function to execute when the document is ready
 * @returns {Promise<Document>} A promise that resolves when the document is ready
 */
export const ready = (callback) => {
    // Create a promise that resolves when the document is ready
    const readyPromise = new Promise((resolve) => {
        // Check if document is already complete
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            // Use setTimeout to push this task to the event queue
            setTimeout(() => resolve(document), 1);
        } else {
            // Wait for the DOMContentLoaded event
            document.addEventListener('DOMContentLoaded', () => {
                resolve(document);
            });
        }
    });

    // If callback is provided, execute it when ready
    if (typeof callback === 'function') {
        readyPromise.then(() => {
            try {
                callback();
            } catch (error) {
                console.error('Error in document ready callback:', error);
            }
        });
    }

    // Return the promise for modern async/await usage
    return readyPromise;
};

/**
 * Escape HTML special characters to prevent XSS attacks
 *
 * @param {string} str - Input string to escape
 * @param {boolean} [extended=false] - Whether to use extended escaping for attributes
 * @returns {string} Escaped HTML string
 */
export const escapeHtml = (str, extended = false) => {
    // Handle non-string inputs
    if (str === null || str === undefined) {
        return '';
    }

    if (typeof str !== 'string') {
        str = String(str);
    }

    // Basic escaping for common HTML entities
    const basicMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };

    // Extended escaping for attribute values (prevents some XSS vectors)
    const extendedMap = {
        ...basicMap,
        '/': '&#x2F;',
        '`': '&#x60;',
        '=': '&#x3D;',
        '{': '&#x7B;',
        '}': '&#x7D;'
    };

    const map = extended ? extendedMap : basicMap;
    const pattern = extended ? /[&<>"'/`={}]/g : /[&<>"']/g;

    // Use replacement function for better performance with large strings
    return str.replace(pattern, match => map[match]);
};

/**
 * Escape HTML for use in attribute values
 *
 * @param {string} str - Input string to escape
 * @returns {string} Escaped HTML string safe for attribute values
 */
export const escapeHtmlAttribute = (str) => {
    return escapeHtml(str, true);
};

/**
 * enable bootstrap tooltips for all elements with data-bs-toggle="tooltip"
 */
export const EnableTooltipsEverywhere = () => {
    const eles = document.querySelectorAll('[data-bs-toggle="tooltip"]') || [];
    eles.forEach((ele) => {
        if (ele.dataset.bsToggle === 'true') {
            return;
        }

        ele.dataset.bsToggle = 'true';
        return new bootstrap.Tooltip(ele);
    });
};

/**
 * disable bootstrap tooltips for all elements with class="tooltip.bs-tooltip-auto.fade.show"
 */
export const DisableTooltipsEverywhere = () => {
    const eles = document.querySelectorAll('.tooltip.bs-tooltip-auto.fade.show') || [];
    eles.forEach((ele) => {
        ele.remove();
    });
}

/**
 * convert blob to hex string
 * @param {Blob} blob
 * @returns {str} hex string
 */
export const blob2Hex = async (blob) => {
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const hexString = Array.from(uint8Array)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');

    return hexString;
};

/**
 * convert hex string to bytes
 * @param {str} hexString
 * @returns {Uint8Array} bytes
 */
export const hex2Bytes = (hexString) => {
    if (!hexString || typeof hexString !== 'string') {
        return new Uint8Array(0);
    }

    const bytePairs = hexString.match(/.{1,2}/g) || [];
    const bytes = bytePairs.map(bytePair => parseInt(bytePair, 16));
    return new Uint8Array(bytes);
};

/**
 * convert hex string to blob
 * @param {str} hexString
 * @returns {Blob} blob
 */
export const hex2Blob = (hexString) => {
    if (!hexString || typeof hexString !== 'string') {
        return new Blob([]);
    }

    const arrayBuffer = (hexString.match(/.{1,2}/g) || [])
        .map(byte => parseInt(byte, 16));
    const uint8Array = new Uint8Array(arrayBuffer);
    return new Blob([uint8Array]);
};

/**
 * gzip string
 * @param {str} stringVal
 * @returns {str} compressed hex string
 */
export const gzip = async (stringVal) => {
    const blob = new Blob([stringVal], { type: 'text/plain' });
    const s = new CompressionStream('gzip');
    const ps = blob.stream().pipeThrough(s);
    const compressedBlob = await new Response(ps).blob();
    return await blob2Hex(compressedBlob);
};

/**
 * ungzip hex string
 * @param {str} hexStringVal - hex string
 * @returns {str} decompressed string
 */
export const ungzip = async (hexStringVal) => {
    const blob = hex2Blob(hexStringVal);
    const s = new DecompressionStream('gzip');
    const ps = blob.stream().pipeThrough(s);
    const decompressedBlob = await new Response(ps).blob();
    return await decompressedBlob.text();
};

/**
 * sanitize html
 * @param {str} str - html string
 * @returns {str} sanitized html string
 */
export const sanitizeHTML = (str) => {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

export const evtTarget = (evt) => {
    return evt.currentTarget || evt.target;
};

/**
 * Wait for the element to be ready.
 *
 * @param {string} selector - The selector of the element to wait for.
 * @returns {Promise} - The promise that resolves when the element is ready.
 */
export const waitElementReady = (selector, maxWaitMs = 3000) => {
    return new Promise((resolve, reject) => {
        const startAt = Date.now();
        const interval = setInterval(() => {
            const ele = document.querySelector(selector);
            if (ele) {
                clearInterval(interval);
                resolve(ele);
            } else if (Date.now() - startAt > maxWaitMs) {
                clearInterval(interval);
                reject(new Error(`waitElementReady timeout for ${selector}`));
            }
        }, 100);
    });
}

/**
 * Generates a random string of the specified length.
 * @param {number} length - The length of the string to generate.
 * @returns {str} - The generated random string.
 */
export const RandomString = (length) => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    return result;
};

/**
 * Copy content to clipboard with modern approach
 *
 * @param {string} content - Text to copy
 * @returns {Promise<boolean>} - Success status
 */
export const Copy2Clipboard = async (content) => {
    try {
        // Modern Clipboard API approach
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(content);
            return true;
        }

        // For older browsers only - with clear warning about deprecation
        console.warn('Using deprecated clipboard API. This may not work in future browser versions.');

        // Create a temporary element
        const textArea = document.createElement('textarea');
        textArea.value = content;

        // Make the element invisible but functional
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        textArea.style.pointerEvents = 'none';
        textArea.style.left = '-999999px';

        // Ensure it's properly added to DOM and focused
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const success = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (!success) {
            console.warn('Clipboard copy failed. This browser may require a secure (HTTPS) connection or user interaction.');
        }

        return success;
    } catch (err) {
        console.error('Failed to copy to clipboard:', err);

        // Provide more specific error feedback
        if (err.name === 'NotAllowedError') {
            console.error('Permission denied. Copy operation must be triggered by user action.');
        } else if (err.name === 'SecurityError') {
            console.error('Clipboard operation not allowed in this context (requires HTTPS).');
        }

        return false;
    }
};

/**
 * Download image to local disk
 *
 * @param {str} b64EncodedImage - base64 encoded image
 */
export const DownloadImage = (b64EncodedImage) => {
    const a = document.createElement('a');
    a.href = b64EncodedImage;
    a.download = 'image.png';
    a.click();
};

/**
 * Check whether it's a touch device
 *
 * @returns true if it's a touch device, false otherwise
 */
export const IsTouchDevice = () => {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
}

/**
 * Get current username
 *
 * @param {string} key
 * @param {string} val
 * @param {number} ttlSeconds - time to live in seconds, default is 1 day
 */
export const SetCache = async (key, val, ttlSeconds = DurationDay) => {
    const cache = {
        val,
        expireAt: Date.now() + ttlSeconds * 1000
    };

    try {
        await KvSet(key, cache);
        console.debug(`cache set: ${key}`);
    } catch (error) {
        console.error(`SetCache failed: ${error}`);
    }
};

/**
 * Get cache
 *
 * @param {string} key
 * @returns null if not found or expired
 */
export const GetCache = async (key) => {
    // Check if 'force' exists in the URL query parameters, ignore cache if true
    if (typeof window !== 'undefined' && window.location) {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('force')) {
            return null;
        }
    }

    try {
        const cache = await KvGet(key);
        if (!cache || cache.expireAt < Date.now()) {
            console.debug(`cache miss: ${key}`);
            await KvDel(key);
            return null;
        }

        console.debug(`cache hit: ${key}`);
        return cache.val;
    } catch (error) {
        console.error(`GetCache failed: ${error}`);
        return null;
    }
};

/**
 * Format a timestamp as a relative time string (e.g., "2 hours ago")
 * @param {string|Date} timestamp - The timestamp to format
 * @returns {string} A relative time string
 */
export const formatRelativeTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffSeconds = Math.floor((now - date) / 1000);

    if (diffSeconds < 60) {
        return 'just now';
    }

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) {
        return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
        return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) {
        return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    }

    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) {
        return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`;
    }

    const diffYears = Math.floor(diffMonths / 12);
    return `${diffYears} year${diffYears !== 1 ? 's' : ''} ago`;
};


const allUtils = {
    ...base,
    ...kvUtils,

    // Individual exported functions
    LoadJsModules,
    Compatible,
    Sleep,
    ActiveElementsByID,
    ActiveElementsByData,
    DateStr,
    Markdown2HTML,
    ScrollDown,
    TrimSpace,
    RenderStr2HTML,
    getSHA1,
    SHA256,
    ready,
    escapeHtml,
    escapeHtmlAttribute,
    EnableTooltipsEverywhere,
    DisableTooltipsEverywhere,
    blob2Hex,
    hex2Bytes,
    hex2Blob,
    gzip,
    ungzip,
    sanitizeHTML,
    evtTarget,
    waitElementReady,
    RandomString,
    Copy2Clipboard,
    DownloadImage,
    IsTouchDevice,
    SetCache,
    GetCache,
    formatRelativeTime
};

export default allUtils;

export {
    kvUtils
};
