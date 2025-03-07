import { jest } from '@jest/globals';

// Mock modules or set up global variables here
global.TextEncoder = class {
    encode(str) {
        return new Uint8Array([...str].map(char => char.charCodeAt(0)));
    }
};

global.Blob = class {
    constructor(parts) {
        this.parts = parts;
        this.size = parts[0]?.length || 0;
    }
};

// Add a mock implementation for Blob.prototype methods
global.Blob.prototype.text = function () {
    return Promise.resolve(
        new TextDecoder().decode(this.parts[0])
    );
};

global.Blob.prototype.arrayBuffer = function () {
    return Promise.resolve(this.parts[0].buffer);
};

// Make jest available globally for mocks
global.jest = jest;

// Mock crypto if needed
if (typeof global.crypto === 'undefined') {
    global.crypto = {
        subtle: {
            digest: jest.fn().mockResolvedValue(new ArrayBuffer(32))
        }
    };
}
