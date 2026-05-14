import React from "react";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  GitBranch,
  Globe2,
  MessageSquare,
  Mic,
  MoreHorizontal,
  PanelLeft,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  TerminalSquare,
  Workflow,
  X,
} from "lucide-react";

const navItems = [
  ["newThread", Plus, "新しいチャット", "新しいチャットを開始", ""],
  ["searchButton", Search, "検索", "チャットを検索", "muted"],
  ["pluginsButton", Box, "プラグイン", "プラグインを表示", "muted"],
  ["automationsButton", Workflow, "オートメーション", "オートメーションを表示", "muted"],
];

const artifacts = ["README.md", "AGENTS.md"];
const reasoningLevels = ["低", "中", "高", "非常に高"];

function FaIcon({ icon, className }) {
  const [width, height, , , path] = icon.icon;
  return (
    <svg className={className} aria-hidden="true" focusable="false" data-prefix={icon.prefix} data-icon={icon.iconName} role="img" viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg">
      <path fill="currentColor" d={path} />
    </svg>
  );
}

function IconCommand({ id, icon, label, ariaLabel, tone }) {
  const Icon = icon;
  return (
    <button type="button" className={`nav-command ${tone}`.trim()} id={id} aria-label={ariaLabel}>
      <span className="command-icon" aria-hidden="true"><Icon size={17} strokeWidth={1.9} /></span>
      <span>{label}</span>
    </button>
  );
}

function Sidebar() {
  return (
    <>
      <button type="button" className="sidebar-scrim" id="sidebarScrim" aria-label="チャット一覧を閉じる" />
      <aside className="sidebar" id="threadSidebar" aria-label="スレッド">
        <div className="sidebar-windowbar" aria-label="Codex local bridge">
          <span className="window-dot red" aria-hidden="true" />
          <span className="window-dot yellow" aria-hidden="true" />
          <span className="window-dot green" aria-hidden="true" />
          <span className="window-spacer" aria-hidden="true" />
          <PanelLeft size={15} strokeWidth={1.8} aria-hidden="true" />
          <ChevronLeft size={15} strokeWidth={1.8} aria-hidden="true" />
          <ChevronRight size={15} strokeWidth={1.8} aria-hidden="true" />
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
          <span className="command-icon" aria-hidden="true"><Settings size={17} strokeWidth={1.9} /></span>
          <span>設定</span>
        </button>
      </aside>
      <div className="sidebar-resize-handle left-resize-handle" id="leftResizeHandle" role="separator" aria-orientation="vertical" aria-label="左サイドバーの幅を調整" tabIndex="0" />
    </>
  );
}

function Header() {
  return (
    <header className="titlebar">
      <div className="titlebar-main">
        <button type="button" className="mobile-toggle side-menu-button" id="mobileThreads" aria-controls="threadSidebar" aria-expanded="false" aria-label="サイドメニューを開く">
          <PanelLeft size={15} strokeWidth={1.9} aria-hidden="true" />
          <span>サイド</span>
        </button>
        <button type="button" className="title-identity" id="sessionSwitcher" aria-live="polite" aria-label="開いているセッションを表示">
          <span className="titlebar-mode-icon" aria-hidden="true">
            <MessageSquare className="titlebar-mode-glyph titlebar-mode-glyph-chat" size={17} strokeWidth={2} />
            <TerminalSquare className="titlebar-mode-glyph titlebar-mode-glyph-terminal" size={17} strokeWidth={2} />
          </span>
          <div className="title-stack">
            <h1 id="threadTitle">Codex Remote</h1>
            <div className="title-status">
              <span className="screen-pill screen-pill-chat">Chat</span>
              <span className="screen-pill screen-pill-terminal">Terminal</span>
              <span className="screen-pill session-count-pill" id="sessionCountPill">1/1</span>
              <p id="meta">接続準備中</p>
            </div>
          </div>
        </button>
        <div className="mode-switch" role="group" aria-label="作業画面を切り替え">
          <button type="button" className="mode-button active" id="modeChatButton" data-main-mode="chat" aria-pressed="true" title="チャット">
            <MessageSquare size={14} strokeWidth={1.9} aria-hidden="true" />
            <span>チャット</span>
          </button>
          <button type="button" className="mode-button" id="modeTerminalButton" data-main-mode="terminal" aria-pressed="false" title="ターミナル">
            <TerminalSquare size={14} strokeWidth={1.9} aria-hidden="true" />
            <span>ターミナル</span>
          </button>
        </div>
        <div className="title-actions">
          <input
            id="pathbarColorPicker"
            className="pathbar-color-input"
            type="color"
            defaultValue="#8ba1c0"
            aria-label="pathbar の色"
            hidden
          />
          <button id="connect" type="button" className="icon-button" title="再接続" aria-label="再接続"><RefreshCw size={16} strokeWidth={1.9} /></button>
          <button type="button" className="icon-button" id="menuButton" title="右パネルを開閉" aria-label="右パネルを開閉" aria-controls="artifactPanel" aria-expanded="false"><MoreHorizontal size={18} strokeWidth={2} /></button>
        </div>
      </div>
      <div className="pathbar" aria-label="作業ディレクトリ">
        <span className="pathbar-label">pwd</span>
        <p id="headerCwd" className="header-cwd" title="">準備中</p>
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
      <div id="slashSuggestions" className="slash-suggestions hidden" />
      <textarea id="prompt" rows="2" placeholder="フォローアップの変更を求める" aria-label="Codex へのメッセージ" />
      <div className="composer-footer">
        <div className="composer-left">
          <button type="button" className="ghost-button icon-only" id="addButton" aria-label="画像を添付"><Plus size={18} strokeWidth={1.9} /></button>
          <button type="button" className="access-button" id="accessButton">
            <span className="access-label">フルアクセス</span>
            <FaIcon icon={faChevronDown} className="button-chevron-icon" />
          </button>
        </div>
        <div className="composer-right">
          <button type="button" id="modelButton" className="model-button">
            <span className="model-button-label">5.5 中</span>
            <FaIcon icon={faChevronDown} className="button-chevron-icon" />
          </button>
          <button type="button" className="voice-button" id="voiceButton" title="音声入力" aria-label="音声入力"><Mic size={18} strokeWidth={1.9} /></button>
          <button id="send" type="submit" className="send-button" title="送信" aria-label="送信"><Send size={18} strokeWidth={2.2} /></button>
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

function TerminalMode() {
  return (
    <section className="terminal-mode" id="terminalMode" aria-label="ターミナル">
      <div className="terminal-toolbar safe-top">
        <button type="button" className="terminal-session-button" id="terminalReconnect" aria-label="ターミナルを再接続">
          <span className="terminal-status-dot" aria-hidden="true" />
          <span className="terminal-session-copy">
            <strong id="terminalStatus">Codex Terminal</strong>
            <small id="terminalSessionMeta">同じ remote thread を Codex CLI TUI で再開</small>
          </span>
          <span className="terminal-session-caret" aria-hidden="true">▾</span>
        </button>
        <div className="terminal-actions" aria-label="ターミナル表示操作">
          <button type="button" className="terminal-mode-theme" id="terminalThemeToggle" aria-label="ターミナルテーマを切り替え">🌙</button>
          <div className="terminal-zoom-row" aria-label="ターミナル文字サイズ">
            <button type="button" id="terminalZoomOut" aria-label="ターミナル文字を小さく">➖</button>
            <span id="terminalFontSizeLabel" aria-label="現在のターミナル文字サイズ">6</span>
            <button type="button" id="terminalZoomIn" aria-label="ターミナル文字を大きく">➕</button>
          </div>
        </div>
      </div>
      <div className="terminal-native-wrap">
        <div id="terminalHost" className="terminal-native-host" aria-label="Codex CLI terminal" />
        <div id="terminalFallback" className="terminal-fallback" role="status">thread 準備中</div>
      </div>
      <div className="terminal-input-area safe-bottom" id="terminalInputArea">
        <div className="terminal-input-top">
          <div className="terminal-input-mode-toggle" role="group" aria-label="入力モード">
            <button type="button" className="active" data-terminal-input-mode="text" aria-pressed="true">Text</button>
            <button type="button" data-terminal-input-mode="keys" aria-pressed="false">Keys</button>
          </div>
          <div id="terminalNativeKeys" className="terminal-native-keys" aria-label="ターミナル補助キー">
            <button type="button" data-terminal-pty-input="\t">Tab</button>
            <button type="button" data-terminal-pty-input="/">/</button>
            <button type="button" data-terminal-pty-input="$">$</button>
            <button type="button" data-terminal-pty-input="\u007f">⌫</button>
            <button type="button" data-terminal-action="cwd">📁</button>
            <button type="button" data-terminal-action="attach">📎</button>
            <button type="button" data-terminal-action="copy">📋</button>
          </div>
        </div>
        <div className="terminal-input-panel" data-terminal-panel="text">
          <textarea id="terminalPrompt" rows="3" placeholder="prompt (Cmd/Ctrl + Enter で送信)" aria-label="ターミナルへ送るテキスト" />
          <button type="button" id="terminalSend" aria-label="Send">Send</button>
        </div>
        <div className="terminal-keys-panel hidden" data-terminal-panel="keys">
          <button type="button" data-terminal-pty-input="\r"><strong>Enter</strong><span>↵</span></button>
          <button type="button" data-terminal-pty-input="\u001b"><strong>Esc</strong></button>
          <button type="button" data-terminal-ctrl-c><strong>Ctrl+C</strong><span>interrupt</span></button>
        </div>
        <input id="terminalFileInput" className="hidden" type="file" accept="image/*" />
      </div>
      <div className="terminal-confirm hidden" id="terminalCtrlCConfirm" role="dialog" aria-modal="true" aria-labelledby="terminalCtrlCTitle">
        <div className="terminal-confirm-card">
          <strong id="terminalCtrlCTitle">Ctrl+C を送信しますか？</strong>
          <p>進行中の処理を中断する可能性があります。</p>
          <div className="terminal-confirm-actions">
            <button type="button" id="terminalCtrlCCancel">Cancel</button>
            <button type="button" className="danger" id="terminalCtrlCConfirmButton">Send Ctrl+C</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function PanelTab({ id, panel, icon, label }) {
  const Icon = icon;
  return (
    <button type="button" className="panel-tab" id={id} data-panel-tab={panel} aria-label={label} title={label} aria-pressed={panel === "artifacts" ? "true" : "false"}>
      <Icon size={14} strokeWidth={1.9} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </button>
  );
}

function ArtifactPanel() {
  return (
    <aside className="artifact-panel" id="artifactPanel" aria-label="右パネル">
      <div className="sidebar-resize-handle right-resize-handle" id="rightResizeHandle" role="separator" aria-orientation="vertical" aria-label="右サイドバーの幅を調整" tabIndex="0" />
      <section className="panel-card primary-panel">
        <div className="panel-title">
          <span id="artifactTitle">アーティファクト</span>
          <button type="button" className="panel-close" id="closePanelButton" title="閉じる" aria-label="右パネルを閉じる"><X size={15} strokeWidth={2} /></button>
        </div>
        <div className="panel-tabs" role="toolbar" aria-label="右パネルを切り替え">
          <PanelTab id="artifactTab" panel="artifacts" icon={FileText} label="成果物" />
          <PanelTab id="workspaceTab" panel="workspace" icon={FolderOpen} label="Files" />
          <PanelTab id="reviewTab" panel="review" icon={GitBranch} label="Diff" />
          <PanelTab id="statusButton" panel="status" icon={TerminalSquare} label="Run" />
          <PanelTab id="webSearchButton" panel="sources" icon={Globe2} label="Web" />
        </div>
        <div id="artifactList">
          {artifacts.map((name) => (
            <button key={name} type="button" className="artifact-row" data-artifact={name}>
              <FileText size={15} strokeWidth={1.9} /><span>{name}</span>
            </button>
          ))}
        </div>
        <div id="artifactPreview" className="artifact-preview hidden" />
      </section>
    </aside>
  );
}

function SessionCreatePage() {
  return (
    <section className="session-create-page hidden" id="sessionCreatePage" aria-label="新しいセッション">
      <div className="session-create-shell">
        <div className="session-create-header">
          <div>
            <p className="session-create-eyebrow">Codex Remote</p>
            <h2>新しいチャット</h2>
            <p>作業するフォルダを選んで、同じ Codex app-server 上に新しい共有セッションを開始します。</p>
          </div>
          <button type="button" className="icon-button" id="sessionCreateCancel" aria-label="新しいセッション作成を閉じる"><X size={16} strokeWidth={2} /></button>
        </div>
        <div className="session-create-body">
          <section className="session-create-section session-selected-section" aria-label="選択中のフォルダ">
            <div className="session-section-heading">
              <div>
                <div className="session-create-label">選択中のフォルダ</div>
                <h3>開始先</h3>
              </div>
              <span className="session-section-badge">Required</span>
            </div>
            <div className="session-cwd-card" id="sessionSelectedCwd" role="status" aria-live="polite">
              <span className="session-card-icon" aria-hidden="true"><FolderOpen size={18} strokeWidth={2} /></span>
              <span className="session-card-main">
                <strong>フォルダを選択</strong>
                <span>下のブラウザから作業ディレクトリを選択</span>
              </span>
            </div>
            <div className="session-browser-toolbar">
              <button type="button" className="ghost-button" id="sessionBrowserUp">上へ</button>
              <span id="sessionBrowserPath">読み込み中</span>
            </div>
            <label className="session-directory-search">
              <span>検索</span>
              <input id="sessionDirectorySearch" type="search" placeholder="フォルダ名で絞り込み" autoComplete="off" />
            </label>
          </section>

          <section className="session-create-section session-browser-section" aria-label="フォルダを選ぶ">
            <div className="session-section-heading">
              <div>
                <div className="session-create-label">フォルダを選ぶ</div>
                <h3>ディレクトリブラウザ</h3>
              </div>
              <label className="session-hidden-toggle">
                <input id="sessionHiddenToggle" type="checkbox" />
                <span>隠しフォルダ</span>
              </label>
            </div>
            <div className="session-browser-list" id="sessionBrowserList" />
          </section>

          <section className="session-create-section session-recent-section" aria-label="最近使ったプロジェクト">
            <div className="session-section-heading">
              <div>
                <div className="session-create-label">最近使ったプロジェクト</div>
                <h3>すぐ開く</h3>
              </div>
              <button type="button" className="session-history-clear" id="sessionRecentClear">履歴を消す</button>
            </div>
            <div className="session-card-list" id="sessionRecentList" />
          </section>
        </div>
        <div className="session-create-footer">
          <span>選択したフォルダで Codex セッションを開始</span>
          <button type="button" className="session-start-button" id="sessionStartButton">このフォルダで開始</button>
        </div>
      </div>
    </section>
  );
}

function SessionSwitcherOverlay() {
  return (
    <section className="session-switcher-overlay hidden" id="sessionSwitcherOverlay" aria-label="開いているセッション">
      <div className="session-switcher-panel">
        <div className="session-switcher-header">
          <div>
            <p className="session-create-eyebrow">Open sessions</p>
            <h2>Sessions</h2>
          </div>
          <button type="button" className="icon-button" id="sessionSwitcherClose" aria-label="セッション一覧を閉じる"><X size={16} strokeWidth={2} /></button>
        </div>
        <div className="session-card-list" id="openSessionList" />
        <button type="button" className="session-start-button" id="sessionSwitcherNew">新しいセッション</button>
      </div>
    </section>
  );
}

export function CodexRemoteShell() {
  return (
    <main className="app-shell">
      <Sidebar />
      <section className="workspace">
        <Header />
        <div className="content-grid">
          <div className="mode-stage">
            <Conversation />
            <TerminalMode />
          </div>
          <ArtifactPanel />
        </div>
      </section>
      <SessionCreatePage />
      <SessionSwitcherOverlay />
    </main>
  );
}
