import { createFixture } from './fixture.js';

try { console.log(JSON.stringify({ repo: createFixture().root })); }
catch { console.error('Could not create temporary Git fixture. Check Git availability.'); process.exitCode = 1; }
