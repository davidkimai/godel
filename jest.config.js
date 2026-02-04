/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        target: 'ES2020',
        module: 'commonjs',
        moduleResolution: 'node',
        lib: ['ES2020'],
        allowJs: true,
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: false,
        forceConsistentCasingInFileNames: true,
        noFallthroughCasesInSwitch: true,
        noImplicitAny: false,
        noImplicitThis: false,
        noImplicitReturns: false,
        noUnusedLocals: false,
        noUnusedParameters: false,
      },
      diagnostics: {
        warnOnly: false,
        ignoreCodes: ['TS2305', 'TS2724', 'TS2352', 'TS2339', 'TS4111', 'TS1259', 'TS2353', 'TS2702'],
      },
    }],
  },
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
    '^@jtan15010/dash$': '<rootDir>/src/index.ts'
  },
  globals: {
    'ts-jest': {
      useESM: false,
    }
  }
};
