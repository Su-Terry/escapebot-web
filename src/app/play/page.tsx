'use client';

import { useState } from 'react';
import { UserButton } from '@clerk/nextjs';
import { startGame, submitAction, resetGame, createShare } from './actions';
import BunCatScene, { type ActionResult } from './BunCatScene';

export default function PlayPage() {
  const [started, setStarted] = useState(false);
  const [generating, setGenerating] = useState(false); // true while startGame is running
  const [isWon, setIsWon] = useState(false);
  const [initialNarration, setInitialNarration] = useState('');
  // Win-screen state (kept in sync by handleAction)
  const [history, setHistory] = useState<{ action: string; narration: string }[]>([]);
  const [scenarioTitle, setScenarioTitle] = useState('');
  // Share-card state
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleStart() {
    setGenerating(true);
    setStarted(true);
    setIsWon(false);
    setHistory([]);
    setScenarioTitle('');
    setInitialNarration('');
    setSelectedIndex(null);
    setShareId(null);
    setSharing(false);
    setCopied(false);
    try {
      const view = await startGame();
      setHistory(view.history);
      setScenarioTitle(view.scenarioTitle);
      setInitialNarration(view.narration);
    } catch (e) {
      alert('生成場景失敗：' + (e as Error).message);
      setStarted(false);
    }
    setGenerating(false);
  }

  // Called by BunCatScene when the player throws a bun
  async function handleAction(action: string): Promise<ActionResult> {
    try {
      const view = await submitAction(action);
      // Keep history / title in sync for the win screen
      setHistory(view.history);
      setScenarioTitle(view.scenarioTitle);
      return { narration: view.narration, isWon: view.isWon };
    } catch (e) {
      return { narration: '（處理失敗：' + (e as Error).message + '）', isWon: false };
    }
  }

  // Called by BunCatScene after the winning bun has landed
  function handleWin() {
    setIsWon(true);
  }

  async function handleReset() {
    await resetGame();
    setStarted(false);
    setIsWon(false);
    setInitialNarration('');
    setHistory([]);
    setScenarioTitle('');
    setSelectedIndex(null);
    setShareId(null);
    setSharing(false);
    setCopied(false);
  }

  const btn: React.CSSProperties = {
    padding: '8px 14px', fontSize: 14, borderRadius: 8,
    border: '1px solid #ccc', background: '#fff', cursor: 'pointer',
  };

  // Win-screen derived values
  const winNarrations = history.map(e => e.narration).filter(Boolean);
  const effectiveIndex = selectedIndex ?? winNarrations.length - 1;

  return (
    <div style={{ width: '100%', maxWidth: 900, margin: '0 auto', padding: '20px 16px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>EscapeBot</h1>
        <UserButton />
      </div>

      {/* ── Start screen ─────────────────────────────────── */}
      {!started && (
        <button
          onClick={handleStart}
          style={{ ...btn, padding: '12px 20px', fontSize: 16, marginTop: 8 }}
        >
          開始新場景
        </button>
      )}

      {/* ── Scenario generating ───────────────────────────── */}
      {started && generating && (
        <div style={{ marginTop: 32, textAlign: 'center', color: '#888', fontSize: 15 }}>
          🔮 謎題生成中…（約 30–60 秒）
        </div>
      )}

      {/* ── Game canvas ───────────────────────────────────── */}
      {started && !generating && !isWon && (
        <>
          <BunCatScene
            onAction={handleAction}
            onWin={handleWin}
            initialNarration={initialNarration}
          />
          <button
            onClick={handleReset}
            style={{ marginTop: 8, fontSize: 12, color: '#bbb', border: 'none', background: 'none', cursor: 'pointer', padding: '4px 0' }}
          >
            重新開始
          </button>
        </>
      )}

      {/* ── Win screen (unchanged logic) ─────────────────── */}
      {isWon && (
        <div style={{ padding: 20, background: '#f8f8f8', borderRadius: 12, marginTop: 8 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>🎉 你通關了！</div>
          {scenarioTitle && (
            <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>{scenarioTitle}</div>
          )}

          <div style={{ fontSize: 13, color: '#555', marginBottom: 10 }}>
            選一句金句做分享卡（tap 選，預設最後一句）：
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto', marginBottom: 20 }}>
            {winNarrations.map((n, i) => {
              const isSelected = i === effectiveIndex;
              return (
                <button
                  key={i}
                  onClick={() => { setSelectedIndex(i); setShareId(null); setCopied(false); }}
                  style={{
                    textAlign: 'left', padding: '10px 14px', fontSize: 13, lineHeight: 1.6,
                    borderRadius: 8,
                    border: isSelected ? '2px solid #111' : '2px solid #e0e0e0',
                    background: isSelected ? '#111' : '#fff',
                    color: isSelected ? '#fff' : '#333', cursor: 'pointer',
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>

          {!shareId && (
            <button
              onClick={async () => {
                setSharing(true);
                try {
                  const result = await createShare(effectiveIndex);
                  setShareId(result.shareId);
                } catch (e) {
                  alert('產生分享連結失敗：' + (e as Error).message);
                }
                setSharing(false);
              }}
              disabled={sharing}
              style={{ ...btn, background: '#111', color: '#fff', border: 'none', minWidth: 120, opacity: sharing ? 0.6 : 1 }}
            >
              {sharing ? '生成中…' : '產生分享連結'}
            </button>
          )}

          {shareId && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  const url = `${window.location.origin}/s/${shareId}`;
                  navigator.clipboard.writeText(url).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
                style={{ ...btn, background: '#111', color: '#fff', border: 'none', minWidth: 100 }}
              >
                {copied ? '✓ 已複製！' : '複製分享連結'}
              </button>
              <a
                href={`/api/og?id=${shareId}`}
                download="escapebot-share.png"
                style={{ ...btn, textDecoration: 'none', display: 'inline-block' }}
              >
                下載卡片
              </a>
              <a
                href={`/s/${shareId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...btn, textDecoration: 'none', display: 'inline-block' }}
              >
                預覽卡片 →
              </a>
            </div>
          )}

          <button
            onClick={handleReset}
            style={{ display: 'block', marginTop: 20, fontSize: 12, color: '#999', border: 'none', background: 'none', cursor: 'pointer', padding: '4px 0' }}
          >
            重新開始
          </button>
        </div>
      )}
    </div>
  );
}
