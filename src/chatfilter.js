// Chat filter (Settings → Filter chat, on by default): swaps the worst words for
// asterisks on your own screen. Matching ignores case, spacing tricks
// ("f u c k"), repeated letters and common look-alike characters ("$h1t").
// It's a word list, so it will never catch everything; mute and report are there
// for the rest.

// stems: a word that starts with one of these is masked (so plurals, -ing, -er
// all count); `exact` words only on their own (they're inside innocent words:
// "class", "cockpit", "night").
const STEMS = [
  'fuck', 'fck', 'shit', 'cunt', 'bitch', 'bastard', 'dickhead', 'pussy', 'wank', 'twat', 'bollock',
  'asshole', 'arsehole', 'motherfuck', 'slut', 'whore', 'retard', 'nigg', 'spastic', 'tranny', 'faggot',
];
const EXACT = ['fuk', 'fk', 'ass', 'arse', 'piss', 'prick', 'cum', 'dick', 'dicks', 'cock', 'cocks', 'spaz', 'nazi', 'kike',
  'chink', 'paki', 'dyke', 'coon', 'fag', 'fags', 'kys', 'nigga', 'niga'];

const LEET = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b', '9': 'g', '|': 'i' };

/** A word with the tricks taken out: lower case, look-alikes swapped, only letters left. */
function plain(w) {
  let s = '';
  for (const ch of w.toLowerCase()) {
    const c = LEET[ch] || ch;
    if (c >= 'a' && c <= 'z') s += c;
  }
  return s;
}

// each letter may be repeated ("fuuuck"): 'fuck' -> /^f+u+c+k+/
const rx = (w, whole) => new RegExp('^' + [...w].map((c) => c + '+').join('') + (whole ? '$' : ''));
const STEM_RX = STEMS.map((w) => rx(w, false)), EXACT_RX = EXACT.map((w) => rx(w, true));
const bad = (p) => p.length > 1 && (EXACT_RX.some((r) => r.test(p)) || STEM_RX.some((r) => r.test(p)));

/** The text with filtered words masked. */
export function filterChat(text) {
  const tokens = String(text).split(/(\s+)/); // keep the spaces
  const out = tokens.slice();
  const words = [];
  tokens.forEach((t, i) => { if (!/^\s+$/.test(t) && t) words.push(i); });
  const mask = (t) => t.replace(/[^\s]/g, '*');
  // single words
  for (const i of words) if (bad(plain(out[i]))) out[i] = mask(out[i]);
  // spelled out with spaces: runs of single letters ("f u c k")
  for (let a = 0; a < words.length; a++) {
    if (tokens[words[a]].length !== 1) continue;
    let b = a, joined = '';
    while (b < words.length && tokens[words[b]].length === 1) { joined += tokens[words[b]]; b++; }
    if (b - a >= 3 && bad(plain(joined))) for (let k = a; k < b; k++) out[words[k]] = '*';
    a = b - 1;
  }
  return out.join('');
}
