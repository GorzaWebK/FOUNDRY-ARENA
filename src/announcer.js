// Call-outs: a big on-screen banner with a short sting (killstreaks, level-ups,
// challenges, objective news). Text only: there is no spoken voice.

export class Announcer {
  constructor(settings, audio, hud) {
    this.settings = settings;
    this.audio = audio;
    this.hud = hud;
  }

  announce(text, sub = '') {
    this.hud.announce(text, sub);
    this.audio.play('announce');
  }
}
