"use client";

import { useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { startGame, submitAction, getCurrentState, resetGame } from "./actions";

export default function PlayPage() {
  const [narration, setNarration] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [isWon, setIsWon] = useState(false);
  const [turnCount, setTurnCount] = useState(0);

  async function handleStart() {
    setLoading(true);
    setStarted(true);
    setNarration("🔮 謎題生成中…（約 30-60 秒）");
    setIsWon(false);
    setTurnCount(0);
    try {
      const result = await startGame();
      setNarration(result.narration || "（場景已生成，輸入「看看四周」開始探索）");
    } catch (e) {
      setNarration("生成場景失敗：" + (e as Error).message);
    }
    setLoading(false);
  }

  async function handleSubmit() {
    if (!input.trim() || loading) return;
    setLoading(true);
    const action = input;
    setInput("");
    try {
      const result = await submitAction(action);
      setNarration(result.narration);
      setIsWon(result.isWon);
      setTurnCount(result.turnCount);
    } catch (e) {
      setNarration("處理失敗：" + (e as Error).message);
    }
    setLoading(false);
  }

  async function handleReset() {
    setLoading(true);
    await resetGame();
    setStarted(false);
    setNarration("");
    setIsWon(false);
    setTurnCount(0);
    setLoading(false);
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>EscapeBot</h1>
        <UserButton />
      </div>

      {!started ? (
        <button
          onClick={handleStart}
          disabled={loading}
          style={{ marginTop: 24, padding: "12px 20px", fontSize: 16, cursor: "pointer" }}
        >
          {loading ? "生成場景中…（約 30-60 秒）" : "開始新場景"}
        </button>
      ) : (
        <>
          <div
            style={{
              whiteSpace: "pre-wrap",
              lineHeight: 1.7,
              margin: "20px 0",
              padding: 16,
              background: "#f5f5f5",
              borderRadius: 8,
              minHeight: 80,
            }}
          >
            {narration}
          </div>

          <div style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>
            Turn {turnCount}
          </div>

          {isWon ? (
            <div style={{ padding: 16, background: "#e8f5e9", borderRadius: 8, marginBottom: 16 }}>
              🎉 你通關了！
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="輸入動作，例如「看看四周」"
                disabled={loading}
                style={{ flex: 1, padding: 10, fontSize: 15, borderRadius: 6, border: "1px solid #ccc" }}
              />
              <button onClick={handleSubmit} disabled={loading} style={{ padding: "10px 16px", cursor: "pointer" }}>
                {loading ? "…" : "送出"}
              </button>
            </div>
          )}

          <button
            onClick={handleReset}
            disabled={loading}
            style={{ marginTop: 20, padding: "6px 12px", fontSize: 13, color: "#888", cursor: "pointer" }}
          >
            重新開始
          </button>
        </>
      )}
    </div>
  );
}
