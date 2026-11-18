// Killstreak announcer: a big banner, a sting, and a spoken call-out using the
// browser's built-in speech synthesis (no audio files). Voice can be switched
// off in settings; the banner always shows.

const PREFERRED = /daniel|google uk english male|arthur|fred|alex|david|guy|male/i;

export class Announcer {
  constructor(settings, audio, hud) {
    this.settings = settings;
    this.audio = audio;
    this.hud = hud;
    this.voice = null;
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    if (this.synth) {
      const pick = () => {
        const en = this.synth.getVoices().filter((v) => /^en/i.test(v.lang));
        // Voices installed on the computer first. Online voices (Chrome's "Google …"
        // ones) stream through the browser's own audio output, and on some systems
        // that cuts out the game's sound for as long as they speak.
        const local = en.filter((v) => v.localService);
        this.voice = local.find((v) => PREFERRED.test(v.name)) || local[0] || en.find((v) => PREFERRED.test(v.name)) || en[0] || null;
      };
      pick();
      if (this.synth.addEventListener) this.synth.addEventListener('voiceschanged', pick);
    }
  }

  announce(text, sub = '') {
    this.hud.announce(text, sub);
    this.audio.play('announce');
    this.say(text);
  }

  say(text) {
    if (!this.synth || !this.settings.announcer || this.audio.muted || this.settings.volume <= 0) return;
    try {
      this.synth.cancel(); // a newer call-out replaces one still being spoken
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.rate = 0.92;
      u.pitch = 0.45; // deep "arena announcer" voice
      u.volume = Math.min(1, this.settings.volume * 1.5);
      // if the system paused the game's audio for the speech, bring it straight back
      u.onstart = u.onend = u.onerror = () => this.audio.kick();
      this.synth.speak(u);
      setTimeout(() => this.audio.kick(), 50);
    } catch (e) { /* speech is a nice-to-have */ }
  }
}
