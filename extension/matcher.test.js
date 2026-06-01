/**
 * Plain-node tests for the dedup engine. Run: node extension/matcher.test.js
 * (No deps. Mirrors the logic that also lives in apps-script/Matcher.gs.)
 */
global.self = global;
require('./matcher.js');
var M = global.Matcher;

var S = {
  email_lowercase: true, email_strip_plus: true, email_ignore_dots: false,
  linkedin_slug_only: true, reddit_strip_prefix: true,
  fuzzy_name_company: false, fuzzy_threshold: 0.85
};

var fails = 0;
function eq(a, b, msg) {
  var ok = JSON.stringify(a) === JSON.stringify(b);
  console.log((ok ? 'PASS ' : 'FAIL ') + msg + (ok ? '' : '  got=' + JSON.stringify(a)));
  if (!ok) fails++;
}

eq(M.normalizeId('linkedin', 'https://www.linkedin.com/in/Jane-Doe/?utm=x', S), 'in/jane-doe', 'linkedin url noise stripped');
eq(M.normalizeId('linkedin', 'linkedin.com/in/jane-doe', S), 'in/jane-doe', 'linkedin bare == full url');
eq(M.normalizeId('email', 'Jane+sales@Acme.com', S), 'jane@acme.com', 'email lowercased + plus stripped');
eq(M.normalizeId('reddit', 'https://www.reddit.com/user/CoolGuy/', S), 'coolguy', 'reddit handle from url');
eq(M.normalizeId('reddit', 'u/CoolGuy', S), 'coolguy', 'reddit bare handle');

var log = [
  { source: 'linkedin', id_normalized: 'in/jane-doe', name: 'Jane Doe', company: 'Acme', added_by: 'Aman', status: 'replied', added_at: '2026-04-12' },
  { source: 'email', id_normalized: 'jane@acme.com', name: 'Jane Doe', company: 'Acme', added_by: 'Vedant', status: 'sent', added_at: '2026-05-01' }
];

eq(M.findHits({ source: 'linkedin', identifier: 'https://www.linkedin.com/in/jane-doe?trk=abc' }, log, S).hits.length, 1, 'duplicate linkedin caught despite url noise');
eq(M.findHits({ source: 'email', identifier: 'JANE@acme.com' }, log, S).hits.length, 1, 'duplicate email caught case-insensitively');
eq(M.findHits({ source: 'linkedin', identifier: 'linkedin.com/in/someone-new' }, log, S).hits.length, 0, 'new person = no false positive');

var Sf = Object.assign({}, S, { fuzzy_name_company: true });
eq(M.findHits({ source: 'other', identifier: 'x.com/jdoe', name: 'Jane Doe', company: 'Acme' }, log, Sf).hits.length >= 1, true, 'fuzzy name+company warns w/o shared id');
eq(M.findHits({ source: 'other', identifier: 'x.com/jdoe', name: 'Jane Doe', company: 'Acme' }, log, S).hits.length, 0, 'fuzzy OFF = no name/company warning');

console.log(fails ? ('\n' + fails + ' FAILED') : '\nAll passed.');
process.exit(fails ? 1 : 0);
