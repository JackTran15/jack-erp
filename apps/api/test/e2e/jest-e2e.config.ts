import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.e2e-spec.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@erp/shared-interfaces$': '<rootDir>/../../../../packages/shared-interfaces/src',
    '^@erp/shared-kafka-client$': '<rootDir>/../../../../packages/shared-kafka-client/src',
  },
  globalSetup: '<rootDir>/setup/global-setup.ts',
  globalTeardown: '<rootDir>/setup/global-teardown.ts',
  setupFilesAfterEnv: ['<rootDir>/setup/jest-setup.ts'],
  testTimeout: 30_000,
};

export default config;
