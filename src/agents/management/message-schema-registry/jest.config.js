module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Root directory
  rootDir: '.',
  
  // Test directories
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.spec.js',
    '<rootDir>/**/__tests__/**/*.js'
  ],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/coverage/',
    '/logs/',
    '/data/',
    '/backups/'
  ],
  
  // Coverage configuration
  collectCoverage: true,
  collectCoverageFrom: [
    'services/**/*.js',
    'config/**/*.js',
    'routes/**/*.js',
    'middleware/**/*.js',
    'models/**/*.js',
    'utils/**/*.js',
    'server.js',
    'index.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/coverage/**',
    '!**/dist/**',
    '!**/build/**'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './services/': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  
  // Coverage reporters
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
    'json'
  ],
  
  // Coverage directory
  coverageDirectory: 'coverage',
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup.js'
  ],
  
  // Module paths
  modulePaths: [
    '<rootDir>'
  ],
  
  // Module directories
  moduleDirectories: [
    'node_modules',
    '<rootDir>'
  ],
  
  // Transform files
  transform: {},
  
  // Module file extensions
  moduleFileExtensions: [
    'js',
    'json',
    'node'
  ],
  
  // Test timeout
  testTimeout: 30000,
  
  // Verbose output
  verbose: true,
  
  // Clear mocks
  clearMocks: true,
  
  // Restore mocks
  restoreMocks: true,
  
  // Reset modules
  resetModules: true,
  
  // Force exit
  forceExit: true,
  
  // Detect open handles
  detectOpenHandles: true,
  
  // Max workers
  maxWorkers: '50%',
  
  // Global setup
  globalSetup: '<rootDir>/tests/globalSetup.js',
  
  // Global teardown
  globalTeardown: '<rootDir>/tests/globalTeardown.js',
  
  // Test environment options
  testEnvironmentOptions: {
    NODE_ENV: 'test'
  },
  
  // Reporters
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'test-results',
        outputName: 'junit.xml',
        ancestorSeparator: ' › ',
        uniqueOutputName: 'false',
        suiteNameTemplate: '{filepath}',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}'
      }
    ]
  ],
  
  // Watch plugins
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ],
  
  // Error on deprecated
  errorOnDeprecated: true,
  
  // Notify mode
  notify: false,
  
  // Bail on first failure in CI
  bail: process.env.CI ? 1 : 0,
  
  // Cache directory
  cacheDirectory: '<rootDir>/.jest-cache',
  
  // Preset
  preset: null,
  
  // Projects (for multi-project setup)
  projects: undefined,
  
  // Runner
  runner: 'jest-runner',
  
  // Snapshot serializers
  snapshotSerializers: [],
  
  // Test results processor
  testResultsProcessor: undefined,
  
  // Transform ignore patterns
  transformIgnorePatterns: [
    '/node_modules/(?!(.*\.mjs$))'
  ],
  
  // Unmocked module path patterns
  unmockedModulePathPatterns: undefined,
  
  // Watch path ignore patterns
  watchPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/coverage/',
    '/logs/',
    '/data/',
    '/backups/'
  ],
  
  // Globals
  globals: {
    NODE_ENV: 'test'
  }
};