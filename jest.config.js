export default {
  testEnvironment: 'node',
  testTimeout: 30000,
  verbose: true,
  collectCoverage: false,
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/test/**/*.test.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleFileExtensions: ['js', 'json'],
  preset: null,
  extensionsToTreatAsEsm: ['.js'],
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  transform: {},
  testEnvironmentOptions: {
    // Add any specific environment options
  },
  // Ignore certain modules during testing
  modulePathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/public/ort/',
    '<rootDir>/public/object_detection_model/'
  ],
  // Handle ES6 modules in dependencies
  transformIgnorePatterns: [
    'node_modules/(?!(eventsource|undici)/)'
  ]
};