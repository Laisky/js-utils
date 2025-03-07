'use strict';

import * as base from './base.js';

import PouchDB from 'pouchdb';

/**
 * async wait for milliseconds
 *
 * @param {*} milliseconds
 * @returns
 */
export const Sleep = async (milliseconds) => {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
};

// {key: [callback1, callback2, {name, callback}]}
const kvListeners = {};
let kv;
let kvInitializing = false;
let kvInitialized = false;

/**
 * Execute a database operation with retry logic for connection issues
 * @param {Function} operation - The database operation function to execute
 * @param {Number} maxRetries - Maximum number of retries
 */
async function executeWithRetry(operation, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await operation();
        } catch (err) {
            if (err.name === 'InvalidStateError' && attempt < maxRetries - 1) {
                console.warn('Database connection closing, retrying operation...');
                await Sleep(300);
                kvInitialized = false;
                await initKv();
            } else {
                throw err;
            }
        }
    }
}

/**
 * Initialize the PouchDB database connection.
 * Handles concurrent initialization attempts and returns the database instance.
 *
 * @async
 * @returns {Promise<object>} PouchDB instance ready for use
 * @throws {Error} If database initialization fails
 */
async function initKv() {
    // If database is already initialized, return immediately
    if (kvInitialized && kv) {
        return kv;
    }

    // If initialization is already in progress, wait for it to complete
    if (kvInitializing) {
        return new Promise(resolve => {
            const checkInterval = setInterval(() => {
                if (kvInitialized && kv) {
                    clearInterval(checkInterval);
                    resolve(kv);
                }
            }, 100);
        });
    }

    // Begin initialization
    kvInitializing = true;

    try {
        // Create new PouchDB instance
        kv = new PouchDB('mydatabase');
        kvInitialized = true;
        return kv;
    } catch (err) {
        kvInitializing = false;
        throw err;
    } finally {
        kvInitializing = false;
    }
}

export const KvOp = Object.freeze({
    SET: 1,
    DEL: 2
});

/**
 * Add listener for keyPrefix
 *
 * @param {str} keyPrefix
 * @param {function} callback - function(keyPrefix, op, oldVal, newVal)
 * @param {str} callbackName - optional, name of the callback. If provided, it will overwrite the existing callback with the same name
 */
export const KvAddListener = async (keyPrefix, callback, callbackName) => {
    await initKv();
    if (!kvListeners[keyPrefix]) {
        kvListeners[keyPrefix] = [];
    }

    if (kvListeners[keyPrefix].indexOf(callback) === -1) {
        if (callbackName) {
            // check whether callbackName is already used, if yes, overwrite it
            let found = false;
            for (let i = 0; i < kvListeners[keyPrefix].length; i++) {
                if (typeof kvListeners[keyPrefix][i] === 'object' && kvListeners[keyPrefix][i].name === callbackName) {
                    kvListeners[keyPrefix][i].callback = callback;
                    found = true;
                    break;
                }
            }

            if (!found) {
                kvListeners[keyPrefix].push({ name: callbackName, callback });
            }
        } else {
            kvListeners[keyPrefix].push(callback);
        }
    }
};

/**
 * Remove listener for keyPrefix by callbackName
 *
 * @param {str} keyPrefix
 * @param {str} callbackName
 */
export const KvRemoveListener = (keyPrefix, callbackName) => {
    if (!kvListeners[keyPrefix]) {
        return;
    }

    for (let i = 0; i < kvListeners[keyPrefix].length; i++) {
        if (typeof kvListeners[keyPrefix][i] === 'object' && kvListeners[keyPrefix][i].name === callbackName) {
            kvListeners[keyPrefix].splice(i, 1);
            break;
        }
    }
};

/**
 * Set data to indexeddb with retry support
 *
 * @param {str} key - key
 * @param {any} val - value
 * @returns {Promise<void>}
 */
export const KvSet = async (key, val) => {
    await initKv();
    console.debug(`KvSet: ${key}`);
    const marshaledVal = JSON.stringify(val);

    let oldVal;

    try {
        // Use executeWithRetry for database operations
        await executeWithRetry(async () => {
            let oldDocu = null;
            try {
                oldDocu = await kv.get(key);
                oldVal = oldDocu ? JSON.parse(oldDocu.val) : null;
            } catch (error) {
                if (error.status !== 404) {
                    throw error;
                }
                // 404 is expected for new keys
            }

            // Attempt to put the document
            const putResult = await kv.put({
                _id: key,
                _rev: oldDocu ? oldDocu._rev : undefined,
                val: marshaledVal
            });

            return putResult;
        });
    } catch (error) {
        // Handle specific errors outside the retry loop
        if (error.status === 409) {
            // Document conflict - ignore
            console.warn(`Conflict detected for key ${key}, ignoring`);
            return;
        }

        console.error(`KvSet for key ${key} failed: ${error}`);
        throw error;
    }

    // Notify listeners (outside try/catch to ensure notifications happen even if there's an error)
    Object.keys(kvListeners).forEach((keyPrefix) => {
        if (key.startsWith(keyPrefix)) {
            for (let i = 0; i < kvListeners[keyPrefix].length; i++) {
                const callbackObj = kvListeners[keyPrefix][i];
                if (typeof callbackObj === 'object') {
                    callbackObj.callback(key, KvOp.SET, oldVal, val);
                } else {
                    callbackObj(key, KvOp.SET, oldVal, val);
                }
            }
        }
    });
};

/** get data from indexeddb
 *
 * @param {str} key
 * @returns null if not found
 */
export const KvGet = async (key) => {
    await initKv();
    console.debug(`KvGet: ${key}`);

    return executeWithRetry(async () => {
        try {
            const doc = await kv.get(key);
            if (!doc || !doc.val) {
                return null;
            }
            return JSON.parse(doc.val);
        } catch (error) {
            if (error.status === 404) {
                return null;
            }
            throw error;
        }
    });
};

/** check if key exists in indexeddb
 *
 * @param {*} key
 * @returns true if exists, false otherwise
 */
export const KvExists = async (key) => {
    await initKv();
    console.debug(`KvExists: ${key}`);

    return executeWithRetry(async () => {
        try {
            await kv.get(key);
            return true;
        } catch (error) {
            if (error.status === 404) {
                return false;
            }
            throw error;
        }
    });
};

/** rename key in indexeddb
 *
 * @param {str} oldKey
 * @param {str} newKey
 */
export const KvRename = async (oldKey, newKey) => {
    await initKv();
    console.debug(`KvRename: ${oldKey} -> ${newKey}`);
    const oldVal = await KvGet(oldKey);
    if (!oldVal) {
        return
    }

    await KvSet(newKey, oldVal);
    await KvDel(oldKey);
};

/**
 * delete key from indexeddb
 * @param {str} key
 * @returns
 */
export const KvDel = async (key) => {
    await initKv();
    console.debug(`KvDel: ${key}`);

    return executeWithRetry(async () => {
        let oldVal = null;
        try {
            const doc = await kv.get(key);
            oldVal = JSON.parse(doc.val);
            await kv.remove(doc);

            // notify listeners...
            Object.keys(kvListeners).forEach((keyPrefix) => {
                if (key.startsWith(keyPrefix)) {
                    for (let i = 0; i < kvListeners[keyPrefix].length; i++) {
                        const callbackObj = kvListeners[keyPrefix][i];
                        if (typeof callbackObj === 'object') {
                            callbackObj.callback(key, KvOp.DEL, oldVal, null);
                        } else {
                            callbackObj(key, KvOp.DEL, oldVal, null);
                        }
                    }
                }
            });
        } catch (error) {
            if (error.status !== 404) {
                throw error;
            }
        }
    });
};

// list all keys from indexeddb
export const KvList = async () => {
    await initKv();
    console.debug('KvList');
    const docs = await kv.allDocs({ include_docs: true });
    const keys = [];
    for (let i = 0; i < docs.rows.length; i++) {
        keys.push(docs.rows[i].doc._id);
    }
    return keys;
};

/**
 * clear all data from indexeddb
 */
export const KvClear = async () => {
    if (!kvInitialized) return;

    console.debug('KvClear');

    // Prevent new operations during destruction
    kvInitialized = false;

    try {
        // Get all keys while we still have access to the database
        const keys = await KvList();

        // Get all values and notify listeners before destroying
        for (const key of keys) {
            try {
                // Get the old value to pass to listeners
                const oldVal = await KvGet(key);

                // Notify listeners
                Object.keys(kvListeners).forEach((keyPrefix) => {
                    if (key.startsWith(keyPrefix)) {
                        kvListeners[keyPrefix].forEach(callbackObj => {
                            if (typeof callbackObj === 'object') {
                                callbackObj.callback(key, KvOp.DEL, oldVal, null);
                            } else {
                                callbackObj(key, KvOp.DEL, oldVal, null);
                            }
                        });
                    }
                });
            } catch (error) {
                console.warn(`Failed to notify listeners for key ${key}:`, error);
            }
        }

        // Destroy database
        if (kv) {
            await kv.destroy();
            kv = null;
        }

        // Add delay before reinitializing
        await Sleep(500);
        await initKv();
    } finally {
        // Ensure kvInitialized is set back to true after initialization
        if (!kvInitialized) {
            await initKv();
        }
    }
};

export const SetLocalStorage = (key, val) => {
    localStorage.setItem(key, JSON.stringify(val));
};
export const GetLocalStorage = (key) => {
    const v = localStorage.getItem(key);
    if (v) {
        return JSON.parse(v);
    } else {
        return v;
    }
};

/**
 * Get current username
 *
 * @param {string} key
 * @param {string} val
 * @param {number} ttlSeconds - time to live in seconds, default is 1 day
 */
export const SetCache = async (key, val, ttlSeconds = base.DurationDay) => {
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
