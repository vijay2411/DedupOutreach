/**
 * Tests for the person-centric dedup engine (unified `link` identifier).
 * Run: node extension/matcher.test.js   (no deps)
 * Mirrors the matcher block in apps-script/Code.gs.
 */
global.self = global;
require('./matcher.js');
var M = global.Matcher;

var S = {
  email_lowercase: true, email_strip_plus: true, email_ignore_dots: false,
  phone_match_last10: true, fuzzy_name_company: false, fuzzy_threshold: 0.85
};

var fails = 0;
function eq(a, b, msg) {
  var ok = JSON.stringify(a) === JSON.stringify(b);
  console.log((ok ? 'PASS ' : 'FAIL ') + msg + (ok ? '' : '  got=' + JSON.stringify(a)));
  if (!ok) fails++;
}

// ── field normalization ────────────────────────────────────────────────────
eq(M.normalizeField('email', 'Jane+sales@Acme.com', S), 'jane@acme.com', 'email lowercased + plus stripped');
eq(M.normalizeField('phone', '+1 (415) 555-1234', S), '4155551234', 'phone digits, country code dropped');
eq(M.normalizeField('phone', '123', S), '', 'too-short phone rejected');

// ── unified link: any profile / handle, platform-prefixed key ──────────────
eq(M.normalizeField('link', 'https://www.linkedin.com/in/Jane-Doe/?utm=x', S), 'li:jane-doe', 'linkedin → li:slug');
eq(M.normalizeField('link', 'linkedin.com/in/jane-doe', S), 'li:jane-doe', 'linkedin bare == full');
eq(M.normalizeField('link', 'https://twitter.com/janedoe', S), 'x:janedoe', 'twitter → x:handle');
eq(M.normalizeField('link', 'x.com/janedoe', S), 'x:janedoe', 'twitter == x');
eq(M.normalizeField('link', '@janedoe', S), 'h:janedoe', 'bare @handle');
eq(M.normalizeField('link', 'reddit.com/user/CoolGuy', S), 'rd:coolguy', 'reddit user url');
// cross-platform same handle does NOT collide:
var diff = M.normalizeField('link', 'x.com/jane', S) !== M.normalizeField('link', 'instagram.com/jane', S);
eq(diff, true, 'same handle on x vs instagram = different keys (no false merge)');

// canonical storage form
eq(M.canonicalize('link', 'LINKEDIN.com/in/Jane-Doe'), 'https://www.linkedin.com/in/jane-doe/', 'linkedin canonical');
eq(M.canonicalize('phone', '+1 (415) 555 1234'), '+14155551234', 'phone canonical keeps +');

// ── person-centric dedup (link / phone / email) ────────────────────────────
var people = [
  { id: '1', name: 'Jane Doe', company: 'Acme', link: 'https://www.linkedin.com/in/jane-doe/', email: '', phone: '' },
  { id: '2', name: 'Bob Lee', company: 'Globex', email: 'bob@globex.com', phone: '+44 20 7946 0958', link: '' }
];
var jr = M.findHits({ link: 'linkedin.com/in/jane-doe?trk=x' }, people, S);
eq(jr.hits.length, 1, 'match person by linkedin link across url noise');
eq(jr.hits[0].contact.id, '1', 'matched the right person');
eq(M.findHits({ phone: '020 7946 0958' }, people, S).hits.length, 1, 'match by phone (country code differs)');
eq(M.findHits({ email: 'BOB@globex.com' }, people, S).hits.length, 1, 'match by email case-insensitively');
eq(M.findHits({ link: 'x.com/someone-new' }, people, S).hits.length, 0, 'new person = no match');

// ── fuzzy name+company toggle ───────────────────────────────────────────────
var Sf = Object.assign({}, S, { fuzzy_name_company: true });
eq(M.findHits({ name: 'Jane Doe', company: 'Acme' }, people, Sf).hits.length, 1, 'fuzzy name+company matches w/o shared id');
eq(M.findHits({ name: 'Jane Doe', company: 'Acme' }, people, S).hits.length, 0, 'fuzzy OFF = no name/company match');

console.log(fails ? ('\n' + fails + ' FAILED') : '\nAll passed.');
process.exit(fails ? 1 : 0);
