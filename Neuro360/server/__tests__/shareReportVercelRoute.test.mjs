import assert from 'node:assert/strict';
import config from '../../vercel.json' with { type: 'json' };
const rewrite = config.rewrites.find(({ source }) => source.startsWith('/api/'));
const [, pathPattern] = rewrite.source.match(/^\/api\/:path\((.*)\)$/);
assert.equal(new RegExp(`^/api/${pathPattern}$`).test('/api/share-report'), false);
console.log('shareReportVercelRoute.test.mjs: ok');
