// Entry point dei test: node tests/run.mjs
import './book.test.mjs';
import './available.test.mjs';
import { run } from './_harness.mjs';

console.log('\n── /api/book + /api/available ──');
await run();
