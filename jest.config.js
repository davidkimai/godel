/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/jest\\.setup\\.(ci|test)\\.ts$/'],
  transformIgnorePatterns: [
    'node_modules/(?!(uuid)/)'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ci.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json',
      diagnostics: {
        warnOnly: true,
        ignoreCodes: ['TS2305', 'TS2724', 'TS2352', 'TS2339', 'TS4111', 'TS1259', 'TS2353', 'TS2702'],
      },
    }],
  },
  testTimeout: 30000, // 30 seconds for integration tests
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },
  moduleNameMapper: {
    '^@dash/(.*)$': '<rootDir>/src/$1',
    '^@godel/(.*)$': '<rootDir>/src/$1',
    '^@jtan15010/dash$': '<rootDir>/src/index.ts',
    '^@jtan15010/godel$': '<rootDir>/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
};
