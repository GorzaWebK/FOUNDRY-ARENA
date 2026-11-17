// Player account: a random unique player ID, plus export / import of everything
// this browser has saved, as one "account code" (or a backup file). There is no
// server: the code itself carries the data, so pasting it into any browser
// restores the account there.
//
// Code format:  FA1.<base64url payload>.<8 hex checksum>
// payload = deflate-raw(JSON) when the browser can compress, else plain JSON
// (a leading "z" or "j" in the payload says which).

const ID_KEY = 'foundry-arena-account';
export const SETTINGS_KEY = 'foundry-arena-settings-v3';
export const RANGE_BEST_KEY = 'foundry-arena-range-best';
export const CAREER_KEY = 'foundry-arena-career';
// every key that belongs to an account (add new saved data here)
const DATA_KEYS = [SETTINGS_KEY, RANGE_BEST_KEY, CAREER_KEY];

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O/1/I to misread
const ID_RE = /^FA-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;
export const isPlayerId = (s) => typeof s === 'string' && ID_RE.test(s);

function randomId() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[b[i] % 32];
  return `FA-${s.slice(0, 4)}-${s.slice(4)}`;
}

function readStore(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

function writeStore(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch (e) { return false; }
}

/** This browser's account: { id, created }. Made on first visit. */
export function getAccount() {
  try {
    const a = JSON.parse(readStore(ID_KEY) || 'null');
    if (a && ID_RE.test(a.id)) return a;
  } catch (e) { /* corrupt: make a new one */ }
  const a = { id: randomId(), created: new Date().toISOString().slice(0, 10) };
  writeStore(ID_KEY, JSON.stringify(a));
  return a;
}

// ---------------------------------------------------------------- encoding

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function toB64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

const canZip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

/** The account code for everything saved in this browser. */
export async function exportCode() {
  const acct = getAccount();
  const data = {};
  for (const k of DATA_KEYS) {
    const v = readStore(k);
    if (v !== null) data[k] = v;
  }
  const json = JSON.stringify({ v: 1, id: acct.id, created: acct.created, saved: new Date().toISOString(), data });
  const raw = new TextEncoder().encode(json);
  const body = canZip ? 'z' + toB64url(await pipe(raw, new CompressionStream('deflate-raw'))) : 'j' + toB64url(raw);
  return `FA1.${body}.${fnv(body)}`;
}

/** Read an account code. Throws an Error with a message for the player if it's no good. */
export async function parseCode(text) {
  const code = String(text || '').replace(/\s+/g, '');
  if (!code) throw new Error('Paste your account code first.');
  const m = /^FA1\.([zj][A-Za-z0-9_-]+)\.([0-9a-f]{8})$/.exec(code);
  if (!m) throw new Error("That isn't an account code. It should start with FA1. — copy the whole thing.");
  if (fnv(m[1]) !== m[2]) throw new Error('That code is damaged or incomplete. Copy the whole code again.');
  let bytes = fromB64url(m[1].slice(1));
  if (m[1][0] === 'z') {
    if (!canZip) throw new Error('This browser is too old to read that code. Update it and try again.');
    bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  }
  const obj = JSON.parse(new TextDecoder().decode(bytes));
  if (!obj || obj.v !== 1 || !ID_RE.test(obj.id) || typeof obj.data !== 'object') throw new Error('That account code is from an unknown version.');
  return obj;
}

/**
 * Replace this browser's account with the one in `obj` (from parseCode).
 * The page should reload afterwards so everything picks it up.
 */
export function importAccount(obj) {
  for (const k of DATA_KEYS) {
    const v = obj.data[k];
    writeStore(k, typeof v === 'string' && v.length < 200000 ? v : null);
  }
  const created = typeof obj.created === 'string' ? obj.created.slice(0, 10) : new Date().toISOString().slice(0, 10);
  writeStore(ID_KEY, JSON.stringify({ id: obj.id, created }));
}
