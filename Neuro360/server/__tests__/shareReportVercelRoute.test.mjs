import assert from 'node:assert/strict';
import config from '../../vercel.json' with { type: 'json' };

const rewrite = config.rewrites.find(({ source }) => source.startsWith('/api/'));
const [, pathPattern] = rewrite.source.match(/^\/api\/:path\((.*)\)$/);
const matcher = new RegExp(`^/api/${pathPattern}$`);

assert.equal(matcher.test('/api/share-report'), false, 'share-report must stay on Vercel, not Render');
console.log('shareReportVercelRoute.test.mjs: ok');
