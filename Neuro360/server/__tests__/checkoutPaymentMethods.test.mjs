import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [server, courses] = await Promise.all([
  readFile(new URL('../index.js', import.meta.url), 'utf8'),
  readFile(new URL('../routes/brainCoursesRoutes.js', import.meta.url), 'utf8'),
]);

assert.match(server, /payment_method_types: \['card'\]/);
assert.doesNotMatch(server, /payment_method_types: \['card', 'link'\]/);
assert.match(courses, /payment_method_types: \['card'\]/);

console.log('checkoutPaymentMethods.test.mjs: ok');
