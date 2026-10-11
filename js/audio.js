const MUSIC_KEY = "knights-leap-music";
const EIGHTH = 60 / 108 / 2;
const LOOP = 64;

const FIELD = {
  bass: parse("0:D3:4 4:A2:4 8:D3:2 10:F3:2 12:E3:2 14:C3:2 16:D3:4 20:A2:4 24:G2:4 28:A2:4 32:D3:4 36:C3:4 40:F3:4 44:C3:2 46:A2:2 48:G2:4 52:A2:4 56:D3:6 62:A2:2"),
  lead: parse("0:D5:2 2:F5:2 4:E5:2 6:D5:2 8:A4:2 10:C5:2 12:D5:4 16:A4:2 18:B4:2 20:C5:2 22:A4:2 24:G4:2 26:A4:2 28:C5:4 32:D5:2 34:F5:2 36:A5:4 40:G5:2 42:F5:2 44:E5:2 46:D5:2 48:C5:2 50:D5:2 52:E5:2 54:C5:2 56:A4:4 60:D5:4"),
  pulse: "dorian",
};

const PRISON = {
  bass: parse("0:D2:4 4:A2:4 8:C3:4 12:G2:4 16:Bb2:4 20:F2:4 24:C3:4 28:A2:4 32:D2:4 36:C3:4 40:F2:4 44:C3:4 48:G2:4 52:Bb2:4 56:D2:8"),
  lead: parse("0:D4:2 2:F4:2 4:E4:2 6:D4:4 10:C4:2 12:A3:4 16:D4:2 18:C4:2 20:Bb3:4 24:A3:2 26:C4:2 28:D4:4 32:F4:2 34:E4:2 36:D4:4 40:C4:2 42:Bb3:2 44:A3:4 48:G3:2 50:A3:2 52:C4:2 54:A3:2 56:D4:8"),
  pulse: "aeolian",
};

export function createAudio() {
  let ctx = null;
  let muted = false;
  let musicOn = readMusicPref();
  let cueName = "field";
  let timer = null;
  let nextTime = 0;
  let cursor = 0;
  let musicBus = null;
  let noise = null;
  const live = [];

  function context() {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function bus() {
    const audio = context();
    if (!musicBus) {
      musicBus = audio.createGain();
      musicBus.gain.value = 0.72;
      musicBus.connect(audio.destination);
    }
    return musicBus;
  }

  function tone(freq, duration, type, gain, slide) {
    if (muted) return;
    const audio = context();
    const now = audio.currentTime;
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slide), now + duration);
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp);
    amp.connect(audio.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function chord(notes, type, gain, step) {
    notes.forEach((freq, index) => {
      const audio = muted ? null : context();
      if (!audio) return;
      const now = audio.currentTime + index * step;
      const osc = audio.createOscillator();
      const amp = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      amp.gain.setValueAtTime(gain, now);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.connect(amp);
      amp.connect(audio.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    });
  }

  function blip(when, freq, duration, type, gain) {
    const audio = context();
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(gain, when + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.04, duration));
    osc.connect(amp);
    amp.connect(bus());
    osc.start(when);
    osc.stop(when + duration + 0.03);
    live.push(osc);
  }

  function tick(when) {
    const audio = context();
    if (!noise) {
      const length = Math.floor(audio.sampleRate * 0.04);
      noise = audio.createBuffer(1, length, audio.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = audio.createBufferSource();
    src.buffer = noise;
    const filter = audio.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1400;
    const amp = audio.createGain();
    amp.gain.setValueAtTime(0.018, when);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(bus());
    src.start(when);
    src.stop(when + 0.05);
    live.push(src);
  }

  function pump() {
    if (!musicOn || !timer) return;
    const audio = context();
    if (audio.state === "suspended") return;
    const pattern = cueName === "prison" ? PRISON : FIELD;
    if (!nextTime) nextTime = audio.currentTime + 0.06;
    const horizon = audio.currentTime + 0.32;
    while (nextTime < horizon) {
      const step = cursor % LOOP;
      for (const note of pattern.bass) {
        if (note.start === step) blip(nextTime, note.freq, note.len * EIGHTH * 0.92, "triangle", 0.055);
      }
      for (const note of pattern.lead) {
        if (note.start === step) blip(nextTime, note.freq, note.len * EIGHTH * 0.9, "square", 0.03);
      }
      if (step % 4 === 0) tick(nextTime);
      if (step % 8 === 0) blip(nextTime, pattern.pulse === "aeolian" ? 73.4 : 146.8, EIGHTH * 0.35, "square", 0.016);
      cursor += 1;
      nextTime += EIGHTH;
    }
    if (live.length > 48) live.splice(0, live.length - 32);
  }

  function silenceMusic() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    nextTime = 0;
    for (const node of live) {
      try {
        node.stop();
      } catch {
        /* already stopped */
      }
    }
    live.length = 0;
  }

  function startMusic() {
    if (!musicOn || timer) return;
    context();
    bus();
    if (!nextTime) cursor = 0;
    timer = setInterval(pump, 70);
    pump();
  }

  return {
    get muted() {
      return muted;
    },
    get music() {
      return musicOn;
    },
    get playing() {
      return Boolean(timer);
    },
    unlock() {
      context();
    },
    toggle() {
      muted = !muted;
      if (!muted) context();
      return muted;
    },
    toggleMusic() {
      musicOn = !musicOn;
      try {
        localStorage.setItem(MUSIC_KEY, musicOn ? "1" : "0");
      } catch {
        /* private mode */
      }
      if (musicOn) startMusic();
      else silenceMusic();
      return musicOn;
    },
    startMusic() {
      if (musicOn) startMusic();
    },
    cue(name) {
      if (name === cueName) return;
      cueName = name === "prison" ? "prison" : "field";
      cursor = 0;
      if (ctx) nextTime = ctx.currentTime + 0.05;
    },
    leap() {
      tone(196, 0.09, "square", 0.035, 523);
    },
    land() {
      tone(140, 0.06, "triangle", 0.04);
    },
    kill() {
      tone(523, 0.07, "square", 0.04, 880);
    },
    hurt() {
      tone(220, 0.22, "sawtooth", 0.045, 55);
    },
    block() {
      tone(660, 0.07, "triangle", 0.04);
    },
    stairs() {
      chord([392, 494, 587], "square", 0.03, 0.07);
    },
    boon() {
      chord([494, 659, 784], "triangle", 0.035, 0.06);
    },
    gate() {
      chord([330, 440, 660], "triangle", 0.04, 0.08);
    },
    victory() {
      chord([392, 494, 587, 784], "square", 0.035, 0.09);
    },
    death() {
      tone(196, 0.45, "sawtooth", 0.05, 42);
    },
  };
}

function readMusicPref() {
  try {
    return localStorage.getItem(MUSIC_KEY) !== "0";
  } catch {
    return true;
  }
}

function pitch(name) {
  const match = /^([A-G])(#|b)?(\d)$/.exec(name);
  const semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let step = semis[match[1]];
  if (match[2] === "#") step += 1;
  if (match[2] === "b") step -= 1;
  const octave = Number(match[3]);
  return 440 * 2 ** ((step + (octave - 4) * 12 - 9) / 12);
}

function parse(score) {
  return score.split(" ").map((token) => {
    const [start, name, len] = token.split(":");
    return { start: Number(start), freq: pitch(name), len: Number(len) };
  });
}
