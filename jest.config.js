export default {
  testEnvironment: 'jsdom',
  testTimeout: 30000,
  verbose: true,
  collectCoverage: false,
  testMatch: ['<rootDir>/public/tests/**/*.test.js', '<rootDir>/__tests__/client/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleFileExtensions: ['js', 'json'],
  preset: null,
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