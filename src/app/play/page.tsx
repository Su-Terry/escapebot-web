"use client";

import { useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { startGame, submitAction, resetGame, createShare } from "./actions";

type Item = { id: string; name: string; isTakeable?: boolean };
type Exit = { id: string; name: string; isLocked?: boolean };

export default function PlayPage() {
  const [narration, setNarration] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [isWon, setIsWon] = useState(false);
  const [turnCount, setTurnCount] = useState(0);
  const [locationName, setLocationName] = useState("");
  const [sceneItems, setSceneItems] = useState<Item[]>([]);
  const [exits, setExits] = useState<Exit[]>([]);
  const [inventory, setInventory] = useState<Item[]>([]);
  const [history, setHistory] = useState<{ action: string; narration: string }[]>([]);
  const [scenarioTitle, setScenarioTitle] = useState("");
  // Win screen state — index into the filtered narration list; null = default to last
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  function applyView(v: Awaited<ReturnType<typeof startGame>>) {
    setNarration(v.narration || "（場景已生成，點下方按鈕開始探索）");
    setIsWon(v.isWon);
    setTurnCount(v.turnCount);
    setLocationName(v.locationName);
    setSceneItems(v.sceneItems);
    setExits(v.exits);
    setInventory(v.inventory);
    setHistory(v.history);
    setScenarioTitle(v.scenarioTitle);
  }

  async function handleStart() {
    setLoading(true);
    setStarted(true);
    setNarration("🔮 謎題生成中…（約 30-60 秒）");
    setIsWon(false);
    setTurnCount(0);
    setSceneItems([]);
    setExits([]);
    setInventory([]);
    try {
      applyView(await startGame());
    } catch (e) {
      setNarration("生成場景失敗：" + (e as Error).message);
    }
    setLoading(false);
  }

  async function send(action: string) {
    if (!action.trim() || loading) return;
    setLoading(true);
    try {
      applyView(await submitAction(action));
    } catch (e) {
      setNarration("處理失敗：" + (e as Error).message);
    }
    setLoading(false);
  }

  async function handleTextSubmit() {
    const action = input;
    setInput("");
    await send(action);
  }

  async function handleReset() {
    setLoading(true);
    await resetGame();
    setStarted(false);
    setNarration("");
    setIsWon(false);
    setTurnCount(0);
    setSceneItems([]);
    setExits([]);
    setInventory([]);
    setHistory([]);
    setScenarioTitle("");
    setSelectedIndex(null);
    setShareId(null);
    setGenerating(false);
    setCopied(false);
    setLoading(false);
  }

  // Win screen derived values
  const winNarrations = history.map((e) => e.narration).filter(Boolean);
  const effectiveIndex = selectedIndex ?? winNarrations.length - 1;

  const btn: React.CSSProperties = {
    padding: "8px 14px",
    fontSize: 14,
    borderRadius: 8,
    border: "1px solid #ccc",
    background: "#fff",
    cursor: "pointer",
  };
  const btnDisabled: React.CSSProperties = { ...btn, opacity: 0.4, cursor: "default" };

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: 24, paddingBottom: 100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>EscapeBot</h1>
        <UserButton />
      </div>

      {!started ? (
        <button onClick={handleStart} disabled={loading} style={{ ...btn, marginTop: 24, padding: "12px 20px", fontSize: 16 }}>
          {loading ? "生成場景中…" : "開始新場景"}
        </button>
      ) : (
        <>
          {locationName && (
            <div style={{ fontSize: 13, color: "#666", marginTop: 16 }}>📍 {locationName}</div>
          )}

          <div
            style={{
              whiteSpace: "pre-wrap",
              lineHeight: 1.7,
              margin: "8px 0 16px",
              padding: 16,
              background: "#f5f5f5",
              borderRadius: 8,
              minHeight: 60,
            }}
          >
            {narration}
          </div>

          <div style={{ fontSize: 12, color: "#999", marginBottom: 12 }}>Turn {turnCount}</div>

          {isWon ? (
            <div style={{ padding: 20, background: "#f8f8f8", borderRadius: 12, marginTop: 8 }}>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>🎉 你通關了！</div>
              {scenarioTitle && (
                <div style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>{scenarioTitle}</div>
              )}

              <div style={{ fontSize: 13, color: "#555", marginBottom: 10 }}>
                選一句金句做分享卡（tap 選，預設最後一句）：
              </div>

              {/* Narration picker */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  maxHeight: 260,
                  overflowY: "auto",
                  marginBottom: 20,
                }}
              >
                {winNarrations.map((n, i) => {
                  const isSelected = i === effectiveIndex;
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        setSelectedIndex(i);
                        setShareId(null);
                        setCopied(false);
                      }}
                      style={{
                        textAlign: "left",
                        padding: "10px 14px",
                        fontSize: 13,
                        lineHeight: 1.6,
                        borderRadius: 8,
                        border: isSelected ? "2px solid #111" : "2px solid #e0e0e0",
                        background: isSelected ? "#111" : "#fff",
                        color: isSelected ? "#fff" : "#333",
                        cursor: "pointer",
                      }}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>

              {/* Phase 1: generate share link */}
              {!shareId && (
                <button
                  onClick={async () => {
                    setGenerating(true);
                    try {
                      const result = await createShare(effectiveIndex);
                      setShareId(result.shareId);
                    } catch (e) {
                      alert("產生分享連結失敗：" + (e as Error).message);
                    }
                    setGenerating(false);
                  }}
                  disabled={generating}
                  style={{
                    ...btn,
                    background: "#111",
                    color: "#fff",
                    border: "none",
                    minWidth: 120,
                    opacity: generating ? 0.6 : 1,
                  }}
                >
                  {generating ? "生成中…" : "產生分享連結"}
                </button>
              )}

              {/* Phase 2: share actions (after shareId obtained) */}
              {shareId && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/s/${shareId}`;
                      navigator.clipboard.writeText(url).then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      });
                    }}
                    style={{ ...btn, background: "#111", color: "#fff", border: "none", minWidth: 100 }}
                  >
                    {copied ? "✓ 已複製！" : "複製分享連結"}
                  </button>

                  <a
                    href={`/api/og?id=${shareId}`}
                    download="escapebot-share.png"
                    style={{ ...btn, textDecoration: "none", display: "inline-block" }}
                  >
                    下載卡片
                  </a>

                  <a
                    href={`/s/${shareId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...btn, textDecoration: "none", display: "inline-block" }}
                  >
                    預覽卡片 →
                  </a>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* 場景物件 */}
              {sceneItems.length > 0 && (
                <Section title="場景物件">
                  {sceneItems.map((it) => (
                    <button
                      key={it.id}
                      onClick={() => send(`查看${it.name}`)}
                      disabled={loading}
                      style={loading ? btnDisabled : btn}
                    >
                      {it.name}
                    </button>
                  ))}
                </Section>
              )}

              {/* 出口 */}
              {exits.length > 0 && (
                <Section title="出口">
                  {exits.map((ex) => (
                    <button
                      key={ex.id}
                      onClick={() => !ex.isLocked && send(`前往${ex.name}`)}
                      disabled={loading || ex.isLocked}
                      style={loading || ex.isLocked ? btnDisabled : btn}
                      title={ex.isLocked ? "需要先解鎖" : undefined}
                    >
                      {ex.isLocked ? "🔒" : "→"} {ex.name}
                    </button>
                  ))}
                </Section>
              )}

              {/* 背包 */}
              {inventory.length > 0 && (
                <Section title="背包">
                  {inventory.map((it) => (
                    <button
                      key={it.id}
                      onClick={() => send(`使用${it.name}`)}
                      disabled={loading}
                      style={loading ? btnDisabled : btn}
                    >
                      🎒 {it.name}
                    </button>
                  ))}
                </Section>
              )}

              {/* 自由文字（角落常駐） */}
              <div
                style={{
                  position: "fixed",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: "#fff",
                  borderTop: "1px solid #eee",
                  padding: 12,
                  display: "flex",
                  gap: 8,
                  maxWidth: 680,
                  margin: "0 auto",
                }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleTextSubmit()}
                  placeholder="自由輸入（解謎答案 / 詭異動作）"
                  disabled={loading}
                  style={{ flex: 1, padding: 10, fontSize: 14, borderRadius: 6, border: "1px solid #ccc" }}
                />
                <button onClick={handleTextSubmit} disabled={loading} style={btn}>
                  {loading ? "…" : "送出"}
                </button>
              </div>
            </>
          )}

          <button onClick={handleReset} disabled={loading} style={{ ...btn, marginTop: 16, fontSize: 12, color: "#999", border: "none", background: "none" }}>
            重新開始
          </button>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: "#999", marginBottom: 6 }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div>
    </div>
  );
}