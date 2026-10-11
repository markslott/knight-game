import { BOON_INFO, LEAP_COST, staminaFill } from "./knight.js";

export function createUI(overlay, hud) {
  let signature = "";
  let hudSignature = "";
  let latest = {};

  hud.addEventListener("click", (event) => {
    const action = event.target.closest("[data-audio]")?.dataset.audio;
    if (action === "mute") latest.onMute?.();
    if (action === "music") latest.onMusic?.();
  });

  function sync(game, points, handlers) {
    latest = handlers;
    const next = screenSignature(game);
    if (next !== signature) {
      signature = next;
      paintScreen(overlay, game, points, handlers);
    }
    const hudNext = hudSignatureOf(game, points);
    const showHud = game.state === "playing" || game.state === "paused" || game.state === "boon";
    hud.hidden = !showHud;
    if (showHud && hudNext !== hudSignature) {
      hudSignature = hudNext;
      paintHud(hud, game, points);
    }
    if (showHud) paintStamina(hud, game);
  }

  return { sync };
}

function screenSignature(game) {
  if (game.state === "boon") return `boon:${game.boonChoices.join(",")}`;
  if (game.state === "dead" || game.state === "victory") return `${game.state}:${game.lastScore}:${game.best}:${game.music ? 1 : 0}`;
  if (game.state === "title") return `title:${game.best}:${game.music ? 1 : 0}`;
  if (game.state === "paused") return `paused:${game.music ? 1 : 0}`;
  return game.state;
}

function hudSignatureOf(game, points) {
  if (!game.knight) return "";
  const names = boonLabels(game.boons).join(",");
  return [
    game.knight.hp,
    game.knight.maxHp,
    game.floorIndex,
    points,
    game.best,
    names,
    game.boons.plate,
    game.muted ? 1 : 0,
    game.music ? 1 : 0,
    game.showHint ? 1 : 0,
    game.level?.boss ? 1 : 0,
    game.state,
  ].join("|");
}

function paintHud(hud, game, points) {
  const hearts = hud.querySelector("#hearts");
  const boons = hud.querySelector("#boon-line");
  const floor = hud.querySelector("#floor-line");
  const score = hud.querySelector("#score-line");
  hearts.replaceChildren();
  for (let i = 0; i < game.knight.maxHp; i++) {
    const pip = document.createElement("span");
    pip.className = i < game.knight.hp ? "heart full" : "heart empty";
    pip.textContent = "♥";
    hearts.appendChild(pip);
  }
  const labels = boonLabels(game.boons);
  boons.textContent = labels.length ? labels.join("  ·  ") : game.showHint ? "Q 2 3 E    D X Z A    or click a gold tile" : "";
  floor.textContent =
    game.state === "boon" ? "A boon awaits" : game.level?.boss ? "The prison" : `Floor ${game.floorIndex} of 4`;
  score.replaceChildren();
  const readout = document.createElement("span");
  readout.textContent = `Score ${points}    Best ${game.best}`;
  score.append(readout, audioButton(game.muted ? "Muted" : "Sound", "mute", game.muted), audioButton(game.music ? "Music" : "Music off", "music", !game.music));
}

function paintStamina(hud, game) {
  const fill = hud.querySelector("#stamina-fill");
  if (!fill || !game.knight) return;
  const ratio = staminaFill(game.knight);
  fill.style.width = `${Math.round(ratio * 1000) / 10}%`;
  fill.classList.toggle("low", game.knight.stamina < LEAP_COST);
}

function boonLabels(boons) {
  const labels = [];
  if (boons.swift) labels.push(boons.swift > 1 ? `Swift ×${boons.swift}` : "Swift");
  if (boons.shock) labels.push("Shock");
  if (boons.blood) labels.push("Blood");
  if (boons.plate > 0) labels.push(`Plate ${boons.plate}`);
  return labels;
}

function paintScreen(overlay, game, points, handlers) {
  overlay.replaceChildren();
  overlay.classList.toggle("active", game.state !== "playing");
  if (game.state === "playing") return;
  if (game.state === "title") overlay.appendChild(titlePanel(game, handlers));
  if (game.state === "paused") overlay.appendChild(pausePanel(handlers, game.music));
  if (game.state === "boon") overlay.appendChild(boonPanel(game, handlers));
  if (game.state === "dead") overlay.appendChild(endPanel("The knight has fallen", points, game.best, handlers, game.music));
  if (game.state === "victory") overlay.appendChild(endPanel("The princess is saved", points, game.best, handlers, game.music));
}

function titlePanel(game, handlers) {
  const panel = document.createElement("section");
  panel.className = "panel title-panel";
  panel.innerHTML = `
    <p class="eyebrow">A chess knight's arcade</p>
    <h1>Knight's Leap</h1>
    <p class="lede">Leap in an L, over walls and onto monsters, and bring the princess home. Each leap spends stamina, and it returns while you stand still. One run. The board does not wait.</p>
    <div class="move-map" aria-hidden="true">
      <span></span><span>2</span><span></span><span>3</span><span></span>
      <span>Q</span><span></span><span></span><span></span><span>E</span>
      <span></span><span></span><span class="piece">♞</span><span></span><span></span>
      <span>A</span><span></span><span></span><span></span><span>D</span>
      <span></span><span>Z</span><span></span><span>X</span><span></span>
    </div>
    <p class="fine">Sir Calder leaps. Princess Maeve calls the squares. Old Cinder keeps the gate. Nibs, Bram, and Vesper mind the halls.</p>
    <p class="fine">Each key sits on its landing. Numpad mirrors the same ring. M mutes effects. N turns the music off. Esc pauses.</p>
    <p class="best">${game.best ? `Best score ${game.best}` : "No rescues yet"}</p>
  `;
  panel.appendChild(button("Begin the leap", handlers.onStart));
  panel.appendChild(ghost(game.music ? "Music on" : "Music off", handlers.onMusic));
  return panel;
}

function pausePanel(handlers, musicOn) {
  const panel = document.createElement("section");
  panel.className = "panel";
  const title = document.createElement("h2");
  title.textContent = "Paused";
  panel.appendChild(title);
  panel.appendChild(button("Resume", handlers.onResume));
  panel.appendChild(ghost(musicOn ? "Music on" : "Music off", handlers.onMusic));
  return panel;
}

function boonPanel(game, handlers) {
  const panel = document.createElement("section");
  panel.className = "panel";
  const title = document.createElement("h2");
  title.textContent = "Choose a boon";
  const copy = document.createElement("p");
  copy.className = "lede";
  copy.textContent = "The next floor is already stirring.";
  const row = document.createElement("div");
  row.className = "boon-row";
  game.boonChoices.forEach((id, index) => {
    const info = BOON_INFO[id];
    const card = document.createElement("button");
    card.className = "boon-card";
    card.type = "button";
    card.innerHTML = `<span class="key">${index + 1}</span><strong>${info.name}</strong><span>${info.text}</span>`;
    card.addEventListener("click", () => handlers.onPick(id));
    row.appendChild(card);
  });
  panel.append(title, copy, row);
  return panel;
}

function endPanel(headline, points, best, handlers, musicOn) {
  const panel = document.createElement("section");
  panel.className = "panel";
  const title = document.createElement("h2");
  title.textContent = headline;
  const score = document.createElement("p");
  score.className = "score-readout";
  score.textContent = `Score ${points}`;
  const bestLine = document.createElement("p");
  bestLine.className = "best";
  bestLine.textContent = `Best ${best}`;
  panel.append(title, score, bestLine, button("Leap again", handlers.onRetry));
  panel.appendChild(ghost(musicOn ? "Music on" : "Music off", handlers.onMusic));
  return panel;
}

function button(label, onClick) {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "primary";
  node.textContent = label;
  node.addEventListener("click", onClick);
  return node;
}

function ghost(label, onClick) {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "ghost";
  node.textContent = label;
  node.addEventListener("click", onClick);
  return node;
}

function audioButton(label, action, off) {
  const node = document.createElement("button");
  node.type = "button";
  node.className = off ? "audio-toggle off" : "audio-toggle";
  node.dataset.audio = action;
  node.textContent = label;
  return node;
}
