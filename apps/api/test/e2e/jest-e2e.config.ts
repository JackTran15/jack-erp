import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.e2e-spec.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testEnvironment: 'node',
  maxWorkers: 1,
  moduleNameMapper: {
    '^@erp/shared-interfaces$': '<rootDir>/../../../../packages/shared-interfaces/src',
    '^@erp/shared-kafka-client$': '<rootDir>/../../../../packages/shared-kafka-client/src',
  },
  globalSetup: '<rootDir>/setup/global-setup.ts',
  globalTeardown: '<rootDir>/setup/global-teardown.ts',
  setupFilesAfterEnv: ['<rootDir>/setup/jest-setup.ts'],
  testTimeout: 30_000,
  // External clients (kafkajs consumers) can leave handles open after the run;
  // force exit so a hanging teardown doesn't masquerade as a suite failure.
  forceExit: true,
};

export default config;
