export default {
    transform: {
        '^.+\\.(js|jsx)$': 'babel-jest'
    },
    transformIgnorePatterns: [],
    testEnvironment: 'jsdom',
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
        // Mock problematic dependencies
        '^pouchdb$': '<rootDir>/tests/__mocks__/pouchdb.js',
        '^marked$': '<rootDir>/tests/__mocks__/marked.js',
        '^bootstrap$': '<rootDir>/tests/__mocks__/bootstrap.js',
        '^js-sha256$': '<rootDir>/tests/__mocks__/js-sha256.js'
    },
    injectGlobals: true,
    setupFiles: ['<rootDir>/tests/setup.js']
};
