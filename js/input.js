import { KNIGHT_OFFSETS } from "./dungeon.js";

const byCode = new Map();
for (const move of KNIGHT_OFFSETS) {
  byCode.set(move.code, move);
  byCode.set(move.numpad, move);
}

export function createInput(canvas) {
  const heldOrder = [];
  let queued = null;
  let pointer = null;
  let hover = null;
  let muteEdge = false;
  let musicEdge = false;
  let pauseEdge = false;
  let startEdge = false;
  let boon = 0;

  function remember(code) {
    const index = heldOrder.indexOf(code);
    if (index >= 0) heldOrder.splice(index, 1);
    heldOrder.push(code);
  }

  function onKeyDown(event) {
    if (event.code === "KeyM") {
      if (!event.repeat) muteEdge = true;
      event.preventDefault();
      return;
    }
    if (event.code === "KeyN") {
      if (!event.repeat) musicEdge = true;
      event.preventDefault();
      return;
    }
    if (event.code === "Escape") {
      if (!event.repeat) pauseEdge = true;
      event.preventDefault();
      return;
    }
    if (event.code === "Enter" || event.code === "Space") {
      if (!event.repeat) startEdge = true;
      event.preventDefault();
    }
    if (!event.repeat && event.code === "Digit1") boon = 1;
    if (!event.repeat && event.code === "Digit2") boon = 2;
    const move = byCode.get(event.code);
    if (!move) return;
    event.preventDefault();
    if (event.repeat) return;
    remember(event.code);
    queued = move;
  }

  function onKeyUp(event) {
    const index = heldOrder.indexOf(event.code);
    if (index >= 0) heldOrder.splice(index, 1);
  }

  function normalize(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }

  window.addEventListener("blur", () => {
    heldOrder.length = 0;
    queued = null;
  });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  canvas.addEventListener("pointerdown", (event) => {
    pointer = normalize(event);
  });
  canvas.addEventListener("pointermove", (event) => {
    hover = normalize(event);
  });
  canvas.addEventListener("pointerleave", () => {
    hover = null;
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  return {
    consumeLeap() {
      const move = queued;
      queued = null;
      return move;
    },
    heldLeap() {
      for (let i = heldOrder.length - 1; i >= 0; i--) {
        const move = byCode.get(heldOrder[i]);
        if (move) return move;
      }
      return null;
    },
    consumePointer() {
      const value = pointer;
      pointer = null;
      return value;
    },
    hover: () => hover,
    consumeMute() {
      const value = muteEdge;
      muteEdge = false;
      return value;
    },
    consumeMusic() {
      const value = musicEdge;
      musicEdge = false;
      return value;
    },
    consumePause() {
      const value = pauseEdge;
      pauseEdge = false;
      return value;
    },
    consumeStart() {
      const value = startEdge;
      startEdge = false;
      return value;
    },
    consumeBoon() {
      const value = boon;
      boon = 0;
      return value;
    },
    clearQueue() {
      queued = null;
      boon = 0;
      startEdge = false;
    },
    release() {
      heldOrder.length = 0;
      queued = null;
      pointer = null;
      boon = 0;
      startEdge = false;
    },
  };
}
