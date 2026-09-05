import type { ExtensionMessage, SelectionRect } from "./messages";

let cleanupActiveCapture: (() => void) | null = null;

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type !== "START_CAPTURE") return;
  cleanupActiveCapture?.();
  cleanupActiveCapture = beginSelection();
});

function beginSelection() {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .veil { position: fixed; inset: 0; background: rgba(14, 23, 33, .38); cursor: crosshair; user-select: none; }
    .tip { position: fixed; top: 18px; left: 50%; translate: -50% 0; color: #fff; background: #17212b;
      border: 1px solid rgba(255,255,255,.18); border-radius: 999px; padding: 9px 14px;
      font: 600 12px/1.2 system-ui, sans-serif; letter-spacing: .02em; box-shadow: 0 8px 28px rgba(0,0,0,.2); }
    .box { position: fixed; display: none; border: 2px solid #f4c95d; background: rgba(244,201,93,.08);
      box-shadow: 0 0 0 9999px rgba(14,23,33,.16); pointer-events: none; }
  `;
  const veil = document.createElement("div");
  veil.className = "veil";
  const tip = document.createElement("div");
  tip.className = "tip";
  tip.textContent = "Drag around the English text · Esc to cancel";
  const box = document.createElement("div");
  box.className = "box";
  shadow.append(style, veil, tip, box);
  host.tabIndex = -1;
  document.documentElement.append(host);
  host.focus({ preventScroll: true });

  let startX = 0;
  let startY = 0;
  let dragging = false;
  let finished = false;

  const remove = () => {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    host.removeEventListener("keydown", onKeyDown, true);
    host.remove();
    cleanupActiveCapture = null;
  };

  const cancel = () => {
    if (finished) return;
    finished = true;
    remove();
    void chrome.runtime.sendMessage({ type: "CAPTURE_CANCELLED" } satisfies ExtensionMessage);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
  };

  veil.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    box.style.display = "block";
    veil.setPointerCapture(event.pointerId);
  });

  veil.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    renderBox(box, rectangle(startX, startY, event.clientX, event.clientY));
  });

  veil.addEventListener("pointerup", (event) => {
    if (!dragging) return;
    dragging = false;
    const rect = rectangle(startX, startY, event.clientX, event.clientY);
    if (rect.width < 8 || rect.height < 8) {
      box.style.display = "none";
      return;
    }
    remove();
    // Wait for the browser to paint the page once without the overlay before requesting a screenshot.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      void chrome.runtime.sendMessage({
        type: "SELECTION_COMPLETE",
        rect,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      } satisfies ExtensionMessage);
    }));
  });

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  host.addEventListener("keydown", onKeyDown, true);
  return remove;
}

function rectangle(x1: number, y1: number, x2: number, y2: number): SelectionRect {
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

function renderBox(element: HTMLElement, rect: SelectionRect) {
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}
