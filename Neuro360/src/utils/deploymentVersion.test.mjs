import assert from 'node:assert/strict';
import { needsDeploymentReset } from './deploymentVersion.js';

assert.equal(needsDeploymentReset(null, 'build-a'), true);
assert.equal(needsDeploymentReset('build-a', 'build-a'), false);
assert.equal(needsDeploymentReset('build-a', 'build-b'), true);

console.log('deploymentVersion.test.mjs: ok');
