import { config as base } from './wdio.conf.js'

export const config = {
    ...base,
    specs: ['./tests/api/**/*.js'],
    maxInstances: 1,
    specFileRetries: process.env.CI ? 2 : 0,
}
