import { jest } from '@jest/globals';

export const marked = {
    parse: jest.fn(text => `<p>${text}</p>`),
    use: jest.fn(),
    Renderer: class {
        constructor() {
            this.code = jest.fn();
        }
    }
};

export default marked;
