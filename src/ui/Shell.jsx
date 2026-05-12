import React from "react";

const navItems = [
  ["newThread", "+", "新しいチャット", "新しいチャットを開始", ""],
  ["searchButton", "⌕", "検索", "チャットを検索", "muted"],
  ["pluginsButton", "◇", "プラグイン", "プラグインを表示", "muted"],
  ["automationsButton", "⟳", "オートメーション", "オートメーションを表示", "muted"],
];

const artifacts = ["README.md", "AGENTS.md"];
const reasoningLevels = ["低", "中", "高", "非常に高"];

function IconCommand({ id, icon, label, ariaLabel, tone }) {
  return (
    <button type="button" className={`nav-command ${tone}`.trim()} id={id} aria-label={ariaLabel}>
      <span className="command-icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function Sidebar() {
  return (
    <>
      <button type="button" className="sidebar-scrim" id="sidebarScrim" aria-label="チャット一覧を閉じる" />
      <aside className="sidebar" id="threadSidebar" aria-label="スレッド">
        <div className="brand-card" aria-label="Codex local bridge">
          <div className="brand-mark" aria-hidden="true">Cx</div>
          <div className="brand-copy">
            <strong>Codex</strong>
            <span>Remote bridge</span>
          </div>
          <span className="brand-status">LAN</span>
        </div>

        <nav className="primary-nav" aria-label="主要操作">
          {navItems.map(([id, icon, label, ariaLabel, tone]) => (
            <IconCommand key={id} id={id} icon={icon} label={label} ariaLabel={ariaLabel} tone={tone} />
          ))}
        </nav>

        <div className="thread-section">
          <div className="section-title">最近のチャット</div>
          <input id="threadSearch" className="thread-search hidden" type="search" placeholder="チャットを検索" aria-label="チャットを検索" />
          <div id="threadList" className="thread-list" />
        </div>

        <button type="button" className="settings" id="settingsButton" aria-label="設定を表示">
          <span className="command-icon" aria-hidden="true">⚙</span>
          <span>設定</span>
        </button>
      </aside>
    </>
  );
}

function Header() {
  return (
    <header className="titlebar">
      <button type="button" className="mobile-toggle" id="mobileThreads" aria-controls="threadSidebar" aria-expanded="false">チャット</button>
      <div className="title-stack">
        <h1 id="threadTitle">Codex Remote</h1>
        <p id="meta">接続準備中</p>
      </div>
      <div className="title-actions">
        <button id="connect" type="button" className="icon-button" title="再接続" aria-label="再接続">↻</button>
        <button type="button" className="icon-button" id="menuButton" title="右パネルを開閉" aria-label="右パネルを開閉" aria-controls="artifactPanel" aria-expanded="false">…</button>
      </div>
    </header>
  );
}

function ModelMenu() {
  return (
    <div id="modelMenu" className="model-menu hidden" role="menu" aria-label="モデルとインテリジェンス">
      <div className="model-menu-label">インテリジェンス</div>
      {reasoningLevels.map((level) => (
        <button
          key={level}
          type="button"
          className="model-menu-row"
          data-reasoning={level}
          role="menuitemradio"
          aria-checked={level === "中" ? "true" : "false"}
        >
          {level}
          {level === "中" ? <span className="checkmark">✓</span> : null}
        </button>
      ))}
      <div className="model-menu-separator" />
      <button type="button" className="model-menu-row submenu-row" data-model-choice="gpt-5.5" role="menuitemradio" aria-checked="false">
        GPT-5.5<span className="chevron">›</span>
      </button>
      <button type="button" className="model-menu-row submenu-row" data-model-choice="gpt-5.4" role="menuitemradio" aria-checked="false">
        GPT-5.4<span className="chevron">›</span>
      </button>
      <button type="button" className="model-menu-row submenu-row" id="moreModelsButton" role="menuitem">
        その他のモデル<span className="chevron">›</span>
      </button>
    </div>
  );
}

function Composer() {
  return (
    <form id="composer" className="composer">
      <input id="fileInput" className="hidden" type="file" accept="image/*" multiple />
      <div id="attachments" className="attachments" aria-live="polite" />
      <textarea id="prompt" rows="2" placeholder="フォローアップの変更を求める" aria-label="Codex へのメッセージ" />
      <div className="composer-footer">
        <div className="composer-left">
          <button type="button" className="ghost-button" id="addButton" aria-label="画像を添付">＋</button>
          <button type="button" className="access-button" id="accessButton">フルアクセス⌄</button>
        </div>
        <div className="composer-right">
          <button type="button" className="thinking-button" id="thinkingButton" title="インテリジェンス" aria-label="インテリジェンスを選択" />
          <button type="button" id="modelButton" className="model-button">5.5 中⌄</button>
          <button type="button" className="voice-button" id="voiceButton" title="音声入力" aria-label="音声入力" />
          <button id="send" type="submit" className="send-button" title="送信" aria-label="送信">↑</button>
        </div>
      </div>
      <ModelMenu />
    </form>
  );
}

function Conversation() {
  return (
    <section className="conversation" aria-label="会話">
      <div id="log" className="log" aria-live="polite" />
      <section id="approval" className="approval hidden">
        <div>
          <strong>承認リクエスト</strong>
          <pre id="approvalText" />
        </div>
        <div className="actions">
          <button id="decline" type="button" className="secondary">拒否</button>
          <button id="approve" type="button">承認</button>
        </div>
      </section>
      <div id="runState" className="run-state" data-state="connecting" role="status" aria-live="polite">
        <span className="run-state-dot" aria-hidden="true" />
        <span id="runStateLabel">接続準備中</span>
      </div>
      <Composer />
    </section>
  );
}

function ArtifactPanel() {
  return (
    <aside className="artifact-panel" id="artifactPanel" aria-label="アーティファクト">
      <section className="panel-card primary-panel">
        <div className="panel-title">
          <span id="artifactTitle">アーティファクト</span>
          <button type="button" className="panel-close" id="closePanelButton" title="閉じる" aria-label="アーティファクトを閉じる">×</button>
        </div>
        <div id="artifactList">
          {artifacts.map((name) => (
            <button key={name} type="button" className="artifact-row" data-artifact={name}>{name}</button>
          ))}
        </div>
        <div id="artifactPreview" className="artifact-preview hidden" />
      </section>
      <section className="panel-card">
        <div className="panel-title">
          <span>バックグラウンド ターミナル</span>
          <span>▪</span>
        </div>
        <div id="terminalList">
          <button type="button" className="terminal-row" id="statusButton">npm run phone</button>
        </div>
      </section>
      <section className="panel-card">
        <div className="panel-title">情報源</div>
        <button type="button" className="source-row" id="webSearchButton">ウェブ検索</button>
      </section>
    </aside>
  );
}

export function CodexRemoteShell() {
  return (
    <main className="app-shell">
      <Sidebar />
      <section className="workspace">
        <Header />
        <div className="content-grid">
          <Conversation />
          <ArtifactPanel />
        </div>
      </section>
    </main>
  );
}
