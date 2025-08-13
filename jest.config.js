export default {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.js'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/public/js/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
  },
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.spec.js'
  ],
  collectCoverageFrom: [
    'public/js/**/*.js',
    '!public/js/**/*.config.js',
    '!public/ort/**',
    '!**/node_modules/**'
  ],
  coverageReporters: ['text', 'html', 'lcov'],
  coverageDirectory: 'coverage',
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  moduleFileExtensions: ['js', 'json'],
  testTimeout: 10000,
  setupFiles: ['jest-canvas-mock'],
  globals: {
    'process.env': {
      NODE_ENV: 'test'
    }
  },
  testEnvironmentOptions: {
    url: 'http://localhost:3000'
  }
};