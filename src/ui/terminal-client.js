import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

const terminalThemes = {
  dark: {
    background: "#1a1d23",
    foreground: "#d4d4d4",
    cursor: "#cb6b35",
    cursorAccent: "#1a1d23",
    selectionBackground: "rgba(203, 107, 53, 0.35)",
    black: "#3c3836",
    red: "#cc6666",
    green: "#a3be8c",
    yellow: "#e5b96b",
    blue: "#7fa1c0",
    magenta: "#b294bb",
    cyan: "#88c0d0",
    white: "#d6d6d6",
    brightBlack: "#7c6f64",
    brightRed: "#fb4934",
    brightGreen: "#b8bb26",
    brightYellow: "#fabd2f",
    brightBlue: "#83a598",
    brightMagenta: "#d3869b",
    brightCyan: "#8ec07c",
    brightWhite: "#ebdbb2",
  },
  light: {
    background: "#fafaf6",
    foreground: "#000000",
    cursor: "#cb6b35",
    cursorAccent: "#fafaf6",
    selectionBackground: "rgba(203, 107, 53, 0.25)",
    black: "#1d1d1d",
    red: "#962020",
    green: "#1f7d36",
    yellow: "#8a5200",
    blue: "#1f5599",
    magenta: "#7a3a86",
    cyan: "#155f6e",
    white: "#2d2d2d",
    brightBlack: "#454545",
    brightRed: "#b22d2d",
    brightGreen: "#2a8a44",
    brightYellow: "#9a6300",
    brightBlue: "#2a6cba",
    brightMagenta: "#8e4d9a",
    brightCyan: "#1d7585",
    brightWhite: "#0d0d0d",
  },
};

const arrowRaw = {
  up: "\u001b[A",
  down: "\u001b[B",
  left: "\u001b[D",
  right: "\u001b[C",
};
const longPressMs = 300;
const longPressMaxMove = 10;
const joystickDeadzonePx = 20;
const repeatIntervalMs = 500;
const verticalSwipeThresholdPx = 30;
const escapeKey = "\u001b";
const ctrlC = "\u0003";

function isTerminalInterruptInput(data) {
  const text = String(data || "");
  return text === escapeKey || text.includes(ctrlC);
}

class CodexNativeTerminal {
  constructor({
    host,
    fallback,
    buildUrl,
    fontSize = 6,
    themeMode = "dark",
    onStatus,
    onSessionState,
    onLongPressActiveChange,
  }) {
    this.host = host;
    this.fallback = fallback;
    this.buildUrl = buildUrl;
    this.onStatus = onStatus;
    this.onSessionState = onSessionState;
    this.onLongPressActiveChange = onLongPressActiveChange;
    this.fontSize = fontSize;
    this.themeMode = themeMode === "light" ? "light" : "dark";
    this.term = null;
    this.fit = null;
    this.ws = null;
    this.key = "";
    this.resizeObserver = null;
    this.touchState = null;
    this.boundViewportFit = () => this.fitTerminal();
    this.boundTouchStart = (event) => this.onTouchStart(event);
    this.boundTouchMove = (event) => this.onTouchMove(event);
    this.boundTouchEnd = (event) => this.onTouchEnd(event);
    this.boundDocumentLongPressTouchMove = (event) => this.onDocumentLongPressTouchMove(event);
    this.boundDocumentLongPressTouchEnd = (event) => this.onDocumentLongPressTouchEnd(event);
    this.boundPointerDown = (event) => this.onPointerDown(event);
    this.boundPointerMove = (event) => this.onPointerMove(event);
    this.boundPointerUp = () => this.onPointerUp();
    this.pointerState = null;
    this.longPressTimer = null;
    this.arrowRepeatTimer = null;
    this.joystickOverlay = null;
    this.activeJoystickDirection = null;
    this.sessionState = null;
    this.longPressActive = false;
    this.longPressDocumentOptions = { capture: true, passive: false };
  }

  connect({ threadId, cwd, force = false, focus = true } = {}) {
    if (!this.host) return false;
    if (!threadId) {
      this.showFallback("thread が準備できたら Codex CLI TUI を開始します。");
      return false;
    }

    const nextKey = `${threadId}\n${cwd || ""}`;
    if (!force && this.ws && this.ws.readyState <= WebSocket.OPEN && this.key === nextKey) {
      this.fitTerminal();
      return true;
    }

    this.closeSocket();
    this.key = nextKey;
    this.ensureTerminal();
    this.term.clear();
    this.showFallback("Codex CLI TUI に接続中...");

    const ws = new WebSocket(this.buildUrl({ threadId, cwd, cols: this.term.cols, rows: this.term.rows }));
    this.ws = ws;
    ws.addEventListener("open", () => {
      this.hideFallback();
      this.onStatus?.("Codex CLI TUI 接続中");
      this.sendResize();
      if (focus) this.term.focus();
    });
    ws.addEventListener("message", (event) => this.handleMessage(event.data));
    ws.addEventListener("close", () => {
      if (this.ws === ws) {
        this.onStatus?.("Codex CLI TUI 切断");
        this.ws = null;
      }
    });
    ws.addEventListener("error", () => {
      this.showFallback("Codex CLI TUI への接続に失敗しました。");
      this.onStatus?.("Codex CLI TUI 接続失敗");
    });
    return true;
  }

  ensureTerminal() {
    if (this.term) return;
    this.fit = new FitAddon();
    this.term = new Terminal({
      allowProposedApi: true,
      convertEol: false,
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: this.fontSize,
      letterSpacing: 0.4,
      lineHeight: 1.25,
      minimumContrastRatio: this.themeMode === "light" ? 7 : 1,
      scrollback: 50000,
      smoothScrollDuration: 200,
      theme: terminalThemes[this.themeMode],
    });
    this.term.loadAddon(this.fit);
    this.term.open(this.host);
    this.host.style.position = this.host.style.position || "relative";
    this.term.onData((data) => this.sendInput(data));
    this.resizeObserver = new ResizeObserver(() => this.fitTerminal());
    this.resizeObserver.observe(this.host);
    this.host.addEventListener("touchstart", this.boundTouchStart, { passive: true });
    this.host.addEventListener("touchmove", this.boundTouchMove, { passive: false });
    this.host.addEventListener("touchend", this.boundTouchEnd, { passive: false });
    this.host.addEventListener("touchcancel", this.boundTouchEnd, { passive: false });
    this.host.addEventListener("pointerdown", this.boundPointerDown);
    this.host.addEventListener("pointermove", this.boundPointerMove);
    this.host.addEventListener("pointerup", this.boundPointerUp);
    this.host.addEventListener("pointercancel", this.boundPointerUp);
    window.visualViewport?.addEventListener("resize", this.boundViewportFit);
    window.addEventListener("orientationchange", this.boundViewportFit);
    this.fitTerminal();
  }

  fitTerminal() {
    if (!this.fit || !this.term) return;
    try {
      this.fit.fit();
      this.sendResize();
    } catch {
      // xterm の初期 open 前 resize は無視する。
    }
  }

  handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === "output" && typeof msg.data === "string") {
      this.hideFallback();
      this.term?.write(msg.data);
      return;
    }
    if (msg.type === "snapshot" && typeof msg.data === "string") {
      this.hideFallback();
      this.term?.reset();
      this.term?.write(msg.data);
      return;
    }
    if (msg.type === "status" && msg.text) {
      this.onStatus?.(msg.text);
      return;
    }
    if (msg.type === "sessionState" && msg.state) {
      this.sessionState = msg.state;
      this.onSessionState?.(msg.state);
      return;
    }
    if (msg.type === "error" && msg.text) {
      this.showFallback(msg.text);
      this.onStatus?.("Codex CLI TUI エラー");
      return;
    }
    if (msg.type === "exit") {
      this.onStatus?.(`Codex CLI TUI 終了 (${msg.code ?? "unknown"})`);
    }
  }

  sendInput(data) {
    if (!data || this.ws?.readyState !== WebSocket.OPEN) return false;
    if (this.sessionState?.status === "running" && !isTerminalInterruptInput(data)) {
      this.onStatus?.("Codex 処理中のため入力を一時停止");
      return false;
    }
    this.ws.send(JSON.stringify({ type: "input", data }));
    return true;
  }

  sendResize() {
    if (!this.term || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "resize", cols: this.term.cols, rows: this.term.rows }));
  }

  setFontSize(fontSize) {
    this.fontSize = Number(fontSize) || this.fontSize;
    if (!this.term) return;
    this.term.options.fontSize = this.fontSize;
    this.fitTerminal();
  }

  setThemeMode(themeMode) {
    this.themeMode = themeMode === "light" ? "light" : "dark";
    if (!this.term) return;
    this.term.options.theme = terminalThemes[this.themeMode];
    this.term.options.minimumContrastRatio = this.themeMode === "light" ? 7 : 1;
  }

  visibleText() {
    if (!this.term) return "";
    const buffer = this.term.buffer.active;
    const lines = [];
    for (let i = 0; i < this.term.rows; i += 1) {
      const line = buffer.getLine(buffer.viewportY + i);
      lines.push(line ? line.translateToString(true) : "");
    }
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return lines.join("\n");
  }

  viewport() {
    return this.host?.querySelector(".xterm-viewport") || null;
  }

  lineHeightPixels() {
    const fontSize = Number(this.term?.options?.fontSize) || 13;
    const lineHeight = Number(this.term?.options?.lineHeight) || 1.2;
    return Math.max(8, fontSize * lineHeight);
  }

  scrollByPixels(deltaY, state) {
    if (!this.term || Math.abs(deltaY) < 2) return false;
    const viewport = this.viewport();
    if (viewport) viewport.scrollTop += deltaY;

    state.remainder += deltaY;
    const lineHeight = this.lineHeightPixels();
    const lines = Math.trunc(state.remainder / lineHeight);
    if (lines !== 0) {
      this.term.scrollLines(lines);
      state.remainder -= lines * lineHeight;
    }
    return true;
  }

  clearLongPressTimer() {
    if (this.longPressTimer === null) return;
    window.clearTimeout(this.longPressTimer);
    this.longPressTimer = null;
  }

  stopArrowRepeat() {
    if (this.arrowRepeatTimer === null) return;
    window.clearInterval(this.arrowRepeatTimer);
    this.arrowRepeatTimer = null;
  }

  sendArrow(direction) {
    const raw = arrowRaw[direction];
    if (raw) this.sendInput(raw);
  }

  setArrowRepeat(direction) {
    if (direction === this.activeJoystickDirection) return;
    this.activeJoystickDirection = direction;
    this.stopArrowRepeat();
    this.updateJoystickDirection(direction);
    if (!direction) return;
    this.sendArrow(direction);
    this.arrowRepeatTimer = window.setInterval(() => this.sendArrow(direction), repeatIntervalMs);
  }

  detectJoystickDirection(dx, dy) {
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (Math.max(absX, absY) < joystickDeadzonePx) return null;
    if (absX > absY) return dx > 0 ? "right" : "left";
    return dy > 0 ? "down" : "up";
  }

  showJoystickOverlay(clientX, clientY) {
    if (!this.host) return;
    const rect = this.host.getBoundingClientRect();
    const overlay = document.createElement("div");
    overlay.className = "terminal-joystick-overlay";
    overlay.style.left = `${clientX - rect.left - 70}px`;
    overlay.style.top = `${clientY - rect.top - 70}px`;
    overlay.innerHTML = `
      <span class="terminal-joystick-zone" data-dir="up">↑</span>
      <span class="terminal-joystick-zone" data-dir="down">↓</span>
      <span class="terminal-joystick-zone" data-dir="left">←</span>
      <span class="terminal-joystick-zone" data-dir="right">→</span>
      <span class="terminal-joystick-dot"></span>
    `;
    this.hideJoystickOverlay();
    this.host.appendChild(overlay);
    this.joystickOverlay = overlay;
  }

  updateJoystickDirection(direction) {
    if (!this.joystickOverlay) return;
    for (const zone of this.joystickOverlay.querySelectorAll("[data-dir]")) {
      zone.classList.toggle("active", zone.dataset.dir === direction);
    }
  }

  hideJoystickOverlay() {
    this.joystickOverlay?.remove();
    this.joystickOverlay = null;
  }

  setLongPressActive(active) {
    const next = Boolean(active);
    if (this.longPressActive === next) return;
    this.longPressActive = next;
    if (next) this.bindDocumentLongPressTouchGuard();
    else this.unbindDocumentLongPressTouchGuard();
    this.onLongPressActiveChange?.(next);
  }

  consumeLongPressTouchEvent(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
  }

  bindDocumentLongPressTouchGuard() {
    document.addEventListener("touchmove", this.boundDocumentLongPressTouchMove, this.longPressDocumentOptions);
    document.addEventListener("touchend", this.boundDocumentLongPressTouchEnd, this.longPressDocumentOptions);
    document.addEventListener("touchcancel", this.boundDocumentLongPressTouchEnd, this.longPressDocumentOptions);
  }

  unbindDocumentLongPressTouchGuard() {
    document.removeEventListener("touchmove", this.boundDocumentLongPressTouchMove, this.longPressDocumentOptions);
    document.removeEventListener("touchend", this.boundDocumentLongPressTouchEnd, this.longPressDocumentOptions);
    document.removeEventListener("touchcancel", this.boundDocumentLongPressTouchEnd, this.longPressDocumentOptions);
  }

  touchListIncludesLongPressTouch(touches) {
    if (!this.touchState || this.touchState.identifier === undefined) return false;
    return Array.from(touches || []).some((touch) => touch.identifier === this.touchState.identifier);
  }

  onDocumentLongPressTouchMove(event) {
    if (!this.longPressActive || this.touchState?.mode !== "long-press" || !this.term) return;
    if (!this.touchListIncludesLongPressTouch(event.touches)) return;
    const touch = Array.from(event.touches).find((item) => item.identifier === this.touchState.identifier);
    if (!touch) return;
    const totalX = touch.clientX - this.touchState.startX;
    const totalY = touch.clientY - this.touchState.startY;
    this.consumeLongPressTouchEvent(event);
    this.setArrowRepeat(this.detectJoystickDirection(totalX, totalY));
  }

  onDocumentLongPressTouchEnd(event) {
    if (!this.longPressActive || !this.touchListIncludesLongPressTouch(event.changedTouches)) return;
    this.consumeLongPressTouchEvent(event);
    this.cleanupTouchInteraction();
  }

  cleanupTouchInteraction() {
    this.clearLongPressTimer();
    this.stopArrowRepeat();
    this.activeJoystickDirection = null;
    this.setLongPressActive(false);
    this.hideJoystickOverlay();
    this.touchState = null;
  }

  onTouchStart(event) {
    if (!event.touches?.length) return;
    const touch = event.touches[0];
    this.cleanupTouchInteraction();
    this.touchState = {
      startX: touch.clientX,
      startY: touch.clientY,
      x: touch.clientX,
      y: touch.clientY,
      identifier: touch.identifier,
      remainder: 0,
      mode: "none",
    };
    this.longPressTimer = window.setTimeout(() => {
      if (!this.touchState || this.touchState.mode !== "none") return;
      this.longPressTimer = null;
      this.touchState.mode = "long-press";
      this.setLongPressActive(true);
      this.showJoystickOverlay(this.touchState.startX, this.touchState.startY);
    }, longPressMs);
  }

  onTouchMove(event) {
    if (!this.touchState || !event.touches?.length || !this.term) return;
    const touch = event.touches[0];
    const totalX = touch.clientX - this.touchState.startX;
    const totalY = touch.clientY - this.touchState.startY;
    const absX = Math.abs(totalX);
    const absY = Math.abs(totalY);
    if (this.touchState.mode === "long-press") {
      this.consumeLongPressTouchEvent(event);
      this.setArrowRepeat(this.detectJoystickDirection(totalX, totalY));
      return;
    }
    if (this.touchState.mode === "vertical-swipe") {
      event.preventDefault();
      return;
    }
    if (absY >= verticalSwipeThresholdPx && absY > absX) {
      this.clearLongPressTimer();
      this.touchState.mode = "vertical-swipe";
      const halfPage = Math.max(1, Math.floor(this.term.rows / 2));
      this.term.scrollLines(halfPage * (totalY > 0 ? -1 : 1));
      event.preventDefault();
      return;
    }
    if (absX > longPressMaxMove || absY > longPressMaxMove) this.clearLongPressTimer();
    const deltaY = this.touchState.y - touch.clientY;
    const deltaX = this.touchState.x - touch.clientX;
    this.touchState.x = touch.clientX;
    this.touchState.y = touch.clientY;
    if (Math.abs(deltaY) < 2 || Math.abs(deltaX) > Math.abs(deltaY) * 1.4) return;

    if (this.scrollByPixels(deltaY, this.touchState)) event.preventDefault();
  }

  onTouchEnd(event) {
    if (this.touchState?.mode === "long-press") this.consumeLongPressTouchEvent(event);
    this.cleanupTouchInteraction();
  }

  onPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    this.pointerState = {
      x: event.clientX,
      y: event.clientY,
      remainder: 0,
    };
    try {
      this.host.setPointerCapture(event.pointerId);
    } catch {
      // capture 非対応ブラウザでは通常の pointer stream に任せる。
    }
  }

  onPointerMove(event) {
    if (!this.pointerState) return;
    const deltaY = this.pointerState.y - event.clientY;
    const deltaX = this.pointerState.x - event.clientX;
    this.pointerState.x = event.clientX;
    this.pointerState.y = event.clientY;
    if (Math.abs(deltaY) < 2 || Math.abs(deltaX) > Math.abs(deltaY) * 1.4) return;
    if (this.scrollByPixels(deltaY, this.pointerState)) event.preventDefault();
  }

  onPointerUp() {
    this.pointerState = null;
  }

  terminate() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "terminate" }));
    }
  }

  focus() {
    this.term?.focus();
  }

  closeSocket() {
    if (!this.ws) return;
    this.ws.close();
    this.ws = null;
  }

  showFallback(text) {
    if (!this.fallback) return;
    this.fallback.textContent = text;
    this.fallback.classList.remove("hidden");
  }

  hideFallback() {
    this.fallback?.classList.add("hidden");
  }

  dispose() {
    this.closeSocket();
    this.resizeObserver?.disconnect();
    this.host?.removeEventListener("touchstart", this.boundTouchStart);
    this.host?.removeEventListener("touchmove", this.boundTouchMove);
    this.host?.removeEventListener("touchend", this.boundTouchEnd);
    this.host?.removeEventListener("touchcancel", this.boundTouchEnd);
    this.host?.removeEventListener("pointerdown", this.boundPointerDown);
    this.host?.removeEventListener("pointermove", this.boundPointerMove);
    this.host?.removeEventListener("pointerup", this.boundPointerUp);
    this.host?.removeEventListener("pointercancel", this.boundPointerUp);
    window.visualViewport?.removeEventListener("resize", this.boundViewportFit);
    window.removeEventListener("orientationchange", this.boundViewportFit);
    this.cleanupTouchInteraction();
    this.term?.dispose();
    this.resizeObserver = null;
    this.term = null;
    this.fit = null;
  }
}

window.CodexNativeTerminal = CodexNativeTerminal;
