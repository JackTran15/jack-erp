import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@erp/shared-interfaces$': '<rootDir>/../../../packages/shared-interfaces/src',
    '^@erp/shared-kafka-client$': '<rootDir>/../../../packages/shared-kafka-client/src',
  },
};

export default config;
