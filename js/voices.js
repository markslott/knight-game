export const VOICES = {
  knight: {
    name: "Sir Calder",
    color: "#d5dde6",
    gap: 7,
    lines: {
      leap: ["Two and one.", "Not the straight road.", "Mind the landing.", "For Maeve."],
      tired: ["That's the last hop.", "Legs, wait.", "Stamina, sir."],
      hurt: ["Rude.", "I felt that square.", "Still standing."],
    },
  },
  grunt: {
    name: "Nibs",
    color: "#8fb596",
    gap: 9,
    lines: {
      talk: ["He's in the air!", "Don't let him land!", "My square!", "Get the horse-man!"],
    },
  },
  brute: {
    name: "Bram",
    color: "#d08a78",
    gap: 10,
    lines: {
      talk: ["I don't hop.", "Come down here.", "One step. That's plenty.", "Heavy feet."],
    },
  },
  spitter: {
    name: "Vesper",
    color: "#c4b6e6",
    gap: 9,
    lines: {
      talk: ["Hold still.", "Knights hate a straight shot.", "Stand in the line.", "Predictable."],
    },
  },
  dragon: {
    name: "Old Cinder",
    color: "#e07a68",
    gap: 10,
    lines: {
      breath: ["File that rank.", "Burn the row.", "I keep the long lines."],
      step: ["The king is in no hurry.", "One square. With weight.", "Come closer, minor piece."],
      hurt: ["A knight, of all pieces.", "You skip like a flea.", "That landing will cost you."],
    },
  },
  princess: {
    name: "Maeve",
    color: "#f2d2e0",
    gap: 18,
    lines: {
      sealed: ["Save me!"],
      open: ["The bars are up. Leap!"],
    },
  },
};

const MAEVE = [
  ["Save me!", "Calder! Save me!", "I'm behind the gate!", "Please, the gate!"],
  ["Still here!", "Save me, I said!", "The gate hasn't moved.", "I can hear you hopping."],
  ["Any century now.", "Save me was not a riddle.", "Are you sightseeing?", "I am aging in here."],
  ["Do you remember me?", "I have named the bars.", "Leap. Toward. Me.", "My hero is sightseeing."],
  ["I will haunt you.", "Save yourself, then.", "The dragon and I chat.", "Come on, Calder."],
];

const MAEVE_OPEN = [
  "The bars are up. Leap!",
  "The bars are up. Leap!",
  "Finally. Leap to me.",
  "Now you hurry. Leap.",
  "Oh, now you hurry.",
];

export function freshMemory() {
  return {
    leaps: 0,
    hurts: 0,
    pits: 0,
    spikes: 0,
    blocks: 0,
    tired: 0,
    dragonHits: 0,
    calls: 0,
    runTime: 0,
    lastHit: "",
    kills: { grunt: 0, brute: 0, spitter: 0, dragon: 0 },
  };
}

export function impatience(memory) {
  const t = memory?.runTime || 0;
  if (t < 18) return 0;
  if (t < 40) return 1;
  if (t < 70) return 2;
  if (t < 110) return 3;
  return 4;
}

const QUIP_LIFE = 5;

export function princessGap(memory) {
  return [18, 16, 14, 12, 11][impatience(memory)];
}

export function speak(game, id, x, y, mood = "talk", entity = null, force = false) {
  const voice = VOICES[id];
  if (!voice || !game.memory) return null;
  const key = `${id}:${mood}`;
  if (!force && game.time < (game.voiceAt[key] || 0)) return null;
  const text = pickLine(game, id, mood);
  if (!text) return null;
  const gap = voice.gap || 8;
  const stillReading = game.quips.filter((quip) => quip.life > 1.6);
  if (stillReading.length >= 2 && !force) {
    game.voiceAt[key] = game.time + gap;
    return null;
  }
  game.voiceAt[key] = game.time + gap;
  game.voiceLast = game.voiceLast || {};
  game.voiceLast[id] = text;
  if (id === "princess") game.memory.calls += 1;
  game.quips = game.quips.filter((quip) => quip.id !== id);
  game.quips.push({
    id,
    text,
    name: voice.name,
    color: voice.color,
    x,
    y,
    entity,
    life: QUIP_LIFE,
    max: QUIP_LIFE,
  });
  while (game.quips.length > 2) {
    let oldest = 0;
    for (let i = 1; i < game.quips.length; i++) {
      if (game.quips[i].life < game.quips[oldest].life) oldest = i;
    }
    game.quips.splice(oldest, 1);
  }
  return text;
}

export function pickLine(game, id, mood) {
  const memory = game.memory;
  if (id === "princess") return princessLine(game, mood);
  const voice = VOICES[id];
  const pool = voice?.lines[mood];
  if (!pool?.length) return null;
  const jab = memoryJab(game, id, mood);
  const last = game.voiceLast?.[id];
  if (jab && jab !== last && Math.random() < 0.62) return jab;
  return choose(pool, last);
}

function princessLine(game, mood) {
  const memory = game.memory;
  const stage = impatience(memory);
  if (mood !== "open" && memory.calls === 0) return "Save me!";
  const jab = stage >= 1 ? maevesJab(game, stage) : null;
  const last = game.voiceLast?.princess;
  if (jab && jab !== last && Math.random() < 0.5) return jab;
  if (mood === "open") return MAEVE_OPEN[stage];
  return choose(MAEVE[stage], last);
}

function maevesJab(game, stage) {
  const memory = game.memory;
  const kills = memory.kills;
  const lines = [];
  if (kills.grunt >= 3) lines.push("Three Nibs. Still here.");
  else if (kills.grunt >= 1) lines.push("Nibs is dead. I'm not.");
  if (kills.brute >= 1) lines.push("You had time for Bram.");
  if (kills.spitter >= 1) lines.push("Vesper can wait.");
  if (memory.pits >= 2) lines.push(`${memory.pits} pits. None were me.`);
  if (memory.spikes >= 2) lines.push("Mind the spikes, hero.");
  if (memory.hurts >= 3) lines.push("Bleed later. Save me.");
  if (memory.tired >= 2) lines.push("Rest later, Calder.");
  if (memory.dragonHits >= 1 && !game.level?.gateOpen) lines.push("Hit him again!");
  if (memory.leaps >= 12) lines.push(`${memory.leaps} leaps. Wrong way.`);
  if (game.floorIndex >= 3 && !game.level?.gateOpen) lines.push(`Floor ${game.floorIndex}. Still locked.`);
  if (stage >= 2 && game.boons?.swift) lines.push("Faster. Still wrong way.");
  if (stage >= 2 && game.boons?.shock) lines.push("Shock them later.");
  if (stage >= 2 && game.boons?.plate > 0) lines.push("Armor is not a rescue.");
  if (stage >= 2 && game.boons?.blood) lines.push("Heal on the way.");
  if (!lines.length) return null;
  return lines[Math.floor(Math.random() * lines.length)];
}

function memoryJab(game, id, mood) {
  const memory = game.memory;
  const kills = memory.kills;
  const fallen = kills.grunt + kills.brute + kills.spitter;
  if (id === "knight") return knightJab(mood, memory, game);
  if (id === "grunt") {
    if (kills.grunt >= 1) return choose(["You got my cousin!", "We remember the hop.", "He told us the L."]);
    if (memory.pits >= 1) return "The hole almost had you!";
    if (memory.hurts >= 1) return "He bleeds! Again!";
    if (memory.leaps >= 8) return "You only know the L!";
  }
  if (id === "brute") {
    if (kills.brute >= 1) return choose(["I don't forget.", "You chipped one of us."]);
    if (game.knight && game.knight.hp <= 2) return "Not many hearts left.";
    if (memory.hurts >= 2) return "Soft little knight.";
    if (memory.leaps >= 6) return "Hopping is not fighting.";
  }
  if (id === "spitter") {
    if (kills.spitter >= 1) return choose(["I watched that shot.", "She lined you up too."]);
    if (memory.leaps >= 5) return "Same L. Every time.";
    if (memory.pits >= 1) return "Holes are straight too.";
    if (memory.calls >= 3) return "Even Maeve is tired.";
  }
  if (id === "dragon") {
    if (mood === "breath") {
      if (memory.dragonHits >= 1) return "You remember this row.";
      if (memory.calls >= 4) return "Even Maeve is tired.";
      if (memory.hurts >= 3) return "A wounded knight. Good.";
    }
    if (mood === "step") {
      if (game.floorIndex >= 4) return "Four floors of hopping.";
      if (fallen >= 4) return "All those pawns. Cute.";
      if (memory.tired >= 2) return "Already out of hops?";
    }
    if (mood === "hurt") {
      if (memory.dragonHits >= 2) return "Again? Rude little piece.";
      if (fallen >= 3) return "They were the warm-up.";
      if (memory.pits >= 2) return "The pits were kinder.";
    }
  }
  return null;
}

function knightJab(mood, memory, game) {
  const stage = impatience(memory);
  if (mood === "hurt") {
    if (memory.lastHit === "spike" && memory.spikes >= 2) return "The spikes again.";
    if (memory.lastHit === "pit" && memory.pits >= 2) return "The hole, again.";
    if (memory.lastHit === "breath") return "I remember that fire.";
    if (memory.hurts >= 2) return `That's bruise ${memory.hurts}.`;
  }
  if (mood === "tired" && memory.tired >= 2) return "I keep spending the last hop.";
  if (mood === "leap" && stage >= 3) return "Maeve is timing me.";
  if (mood === "leap" && stage >= 2) return "She's getting sharp.";
  if (mood === "leap" && memory.kills.grunt >= 3) return "Nibs had friends.";
  if (mood === "leap" && memory.pits >= 2) return "Not the hole this time.";
  return null;
}

function choose(pool, last) {
  if (!pool?.length) return null;
  if (pool.length === 1) return pool[0];
  let index = Math.floor(Math.random() * pool.length);
  if (pool[index] === last) index = (index + 1) % pool.length;
  return pool[index];
}
