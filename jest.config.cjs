module.exports = {
  testEnvironment: 'node',
  testTimeout: 30000,
  verbose: true,
  collectCoverage: false,
  testMatch: [
    '**/__tests__/**/*.test.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleFileExtensions: ['js', 'json'],
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
    'node_modules/(?!(some-es6-module)/)'
  ]
};