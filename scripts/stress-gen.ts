/**
 * Puzzle stress-test: batch-generate 15 scenarios and dump puzzle+clue data for
 * human solvability review. Does NOT judge quality — only surfaces raw data.
 *
 * Usage:
 *   pnpm tsx scripts/stress-gen.ts [--out results/stress-YYYY-MM-DD.txt]
 *   (defaults to stdout)
 *
 * Cost estimate: ~15 × Gemini 2.5 Pro calls (same as 15 new games in production).
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import * as fs from "fs";
import { generateScenario } from "../src/lib/engine/scenarioGenerator";
import type { WorldState, Item, Location, Puzzle, PuzzleGraph } from "../src/lib/engine/types";

// ── Config ────────────────────────────────────────────────────────────────────

const CONCURRENCY = 3;

// 15 diverse themes — ensures the test covers varied puzzle contexts, not just
// "廢棄設施" or "古代神廟" which Gemini defaults to without guidance.
const THEMES = [
  "古代埃及神廟",
  "廢棄深空研究站",
  "維多利亞時代圖書館",
  "水下海洋研究基地",
  "中世紀煉金術師工坊",
  "1930 年代上海租界公寓",
  "蒸汽龐克飛空艇引擎室",
  "日本江戶時代忍者道場",
  "克蘇魯神殿地下室",
  "廢棄遊樂園控制室",
  "高科技生化實驗室",
  "維京海盜船貨艙",
  "現代美術館夜間竊盜現場",
  "冰島地熱火山洞穴",
  "地下城市魔法師公會",
];

// ── Output ────────────────────────────────────────────────────────────────────

const outArg = process.argv.indexOf("--out");
const outFile = outArg !== -1 ? process.argv[outArg + 1] : null;
const lines: string[] = [];

function emit(line = "") {
  lines.push(line);
}

function flush() {
  const text = lines.join("\n");
  if (outFile) {
    fs.mkdirSync(require("path").dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, text, "utf8");
    console.error(`\nWrote ${lines.length} lines to ${outFile}`);
  } else {
    process.stdout.write(text + "\n");
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Classify solution as "純數字" | "數字序列" | "詞語/字串" */
function solutionType(solution: string): string {
  if (/^\d+$/.test(solution)) return "純數字";
  if (/^[\d\s、,，.·]+$/.test(solution.trim())) return "數字序列";
  return "詞語/字串";
}

/**
 * Extract format hints from puzzle description.
 * Looks for phrases like "N位數", "輸入X", "按…順序", "用X分隔" etc.
 * Returns "(無明顯 format hint)" if nothing found.
 */
function extractFormatHint(desc: string): string {
  const matchers = [
    /\d+\s*位數[字碼]?/,
    /輸入\S{1,10}/,
    /按[^，。；]{2,15}順序/,
    /用[^，。；]{1,6}分隔/,
    /格式[：:][^，。；]{1,20}/,
    /[（(][^）)]{1,30}[）)]/,     // parenthetical format notes
    /選擇\S{1,10}/,
    /填入\S{1,10}/,
    /[①②③\d]\s*個\S{1,6}/,
    /\d+\s*個選項/,
  ];
  const found: string[] = [];
  for (const re of matchers) {
    const m = desc.match(re);
    if (m) found.push(m[0].trim());
  }
  return found.length > 0 ? found.join(" | ") : "(無明顯 format hint)";
}

/**
 * Return contiguous substrings of the solution that are useful for clue-hunting.
 * - Always includes the full solution.
 * - For numeric solutions: all runs of 2+ consecutive digits.
 * - For all solutions ≤ 8 chars: every 2-char window.
 * - Chinese word chunks of 2+ chars.
 */
function solutionFragments(solution: string): string[] {
  const frags = new Set<string>();
  frags.add(solution);
  // 2+ digit runs
  for (const m of solution.matchAll(/\d{2,}/g)) frags.add(m[0]);
  // sliding 2-char window for short solutions
  if (solution.length <= 8) {
    for (let i = 0; i < solution.length - 1; i++) {
      frags.add(solution.slice(i, i + 2));
    }
  }
  // Chinese word chunks
  for (const m of solution.matchAll(/[一-龥]{2,}/g)) frags.add(m[0]);
  return [...frags].filter(f => f.length >= 2);
}

/**
 * Check whether a description text likely contains a clue for the given solution.
 * Heuristic: any solution fragment (≥2 chars) appears in the text.
 */
function likelyClue(desc: string, fragments: string[]): boolean {
  return fragments.some(f => desc.includes(f));
}

// ── PuzzleGraph dump (Phase 3a) ───────────────────────────────────────────────
//
// Prints each graph in full so groundingProof can be manually inspected.
// 3a validates graph STRUCTURE only (reachability, path length, sourceRef existence).
// groundingProof authenticity (does it actually match description text?) is Phase 3b.
// REVIEW the groundingProof lines below: vague or unquoted proofs = LLM fabrication risk.

function dumpPuzzleGraph(
  pid: string,
  graph: PuzzleGraph | undefined,
  ws: WorldState,
): void {
  if (!graph) {
    emit(`  │`);
    emit(`  │ 【PuzzleGraph】⚠ 未生成 (puzzle '${pid}' 圖缺失)`);
    return;
  }

  // ── Structural validation (mirror of validatePuzzleGraphs, read-only) ──────
  const structIssues: string[] = [];

  const solutionNode = graph.nodes[graph.solutionNodeId];
  if (!solutionNode) structIssues.push(`solutionNodeId '${graph.solutionNodeId}' 不在 nodes`);

  const clueNodeIds = new Set(
    Object.entries(graph.nodes)
      .filter(([, n]) => n.type === "clue")
      .map(([id]) => id),
  );

  const KNOWN_PREFIXES = ["locations.", "location.", "location:", "items.", "item.", "item:"];
  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    if (node.type !== "clue") continue;
    if (!node.sourceRef) {
      structIssues.push(`ClueNode '${nodeId}' 缺 sourceRef`);
      continue;
    }
    // Mirror validatePuzzleGraphs prefix stripping
    let ref = node.sourceRef;
    for (const prefix of KNOWN_PREFIXES) {
      if (ref.startsWith(prefix)) { ref = ref.slice(prefix.length); break; }
    }
    if (ws.puzzles[ref]) {
      structIssues.push(`ClueNode '${nodeId}' sourceRef 是 puzzle id (禁止)`);
    } else if (!ws.items[ref] && !ws.locations[ref]) {
      structIssues.push(`ClueNode '${nodeId}' sourceRef '${ref}' 不存在`);
    }
  }

  const reachable = new Set<string>(clueNodeIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of graph.edges) {
      if (!reachable.has(edge.to) && edge.from.every((id) => reachable.has(id))) {
        reachable.add(edge.to);
        changed = true;
      }
    }
  }
  const solutionReachable = reachable.has(graph.solutionNodeId);
  if (!solutionReachable) structIssues.push(`SolutionNode 不可達`);

  for (const edge of graph.edges) {
    if (edge.to !== graph.solutionNodeId) continue;
    if (edge.from.every((id) => clueNodeIds.has(id))) {
      structIssues.push(`SolutionNode 被 ClueNodes-only 直連 (路徑長度 < 2)`);
    }
  }

  // ── Output ──────────────────────────────────────────────────────────────────
  const nodesByType = { clue: 0, inference: 0, solution: 0 };
  for (const n of Object.values(graph.nodes)) nodesByType[n.type]++;

  emit(`  │`);
  emit(`  │ 【PuzzleGraph 3a — 結構自洽性檢查; groundingProof 真實性請人工審】`);
  emit(`  │  Nodes: clue×${nodesByType.clue}  inference×${nodesByType.inference}  solution×${nodesByType.solution}  Edges: ${graph.edges.length}`);

  const reachOk = solutionReachable ? "✓ 可達" : "✗ 不可達";
  const pathOk = structIssues.some((s) => s.includes("路徑長度")) ? "✗ 路徑<2" : "✓ 路徑≥2";
  const refOk = structIssues.some((s) => s.includes("sourceRef")) ? "✗ sourceRef錯誤" : "✓ sourceRefs";
  emit(`  │  ${reachOk}  ${pathOk}  ${refOk}`);

  if (structIssues.length > 0) {
    for (const issue of structIssues) emit(`  │  ⚠ ${issue}`);
  }

  emit(`  │`);
  emit(`  │  節點:`);
  for (const [nid, node] of Object.entries(graph.nodes)) {
    const ref = node.sourceRef ? `  [→${node.sourceRef}]` : "";
    emit(`  │    ${node.type.padEnd(9)} ${nid}${ref}`);
    emit(`  │              "${node.label}"`);
  }

  emit(`  │`);
  emit(`  │  邊 (groundingProof 須人工審: 引用是否真的在 description 中):`);
  for (let i = 0; i < graph.edges.length; i++) {
    const edge = graph.edges[i];
    const typeTag = edge.inferenceType.padEnd(16);
    emit(`  │    [${i + 1}] ${typeTag} [${edge.from.join(", ")}] → ${edge.to}`);
    // groundingProof 全文分行印出，讓人工能判斷是否造假
    const proof = edge.groundingProof || "(空)";
    const lines = proof.match(/.{1,70}/g) ?? [proof];
    emit(`  │        groundingProof: ${lines[0]}`);
    for (let l = 1; l < lines.length; l++) {
      emit(`  │                        ${lines[l]}`);
    }
  }
}

// ── Dump a single scenario ────────────────────────────────────────────────────

function dumpScenario(n: number, theme: string, ws: WorldState) {
  emit(`${"═".repeat(72)}`);
  emit(`SCENE ${n}  主題: ${theme}`);
  emit(`標題: ${ws.scenarioTitle}`);
  emit(`起點: ${ws.currentLocationId}  →  終點: ${ws.winCondition.targetLocationId}`);
  emit(`通關需解: [${ws.winCondition.requiredSolvedPuzzleIds.join(", ")}]`);
  emit(`通關條件描述: ${ws.winCondition.description}`);
  emit(`房間數: ${Object.keys(ws.locations).length}  物品數: ${Object.keys(ws.items).length}  謎題數: ${Object.keys(ws.puzzles).length}`);
  emit();

  // ── Puzzles ──────────────────────────────────────────────────────────────
  for (const [pid, puzzle] of Object.entries(ws.puzzles) as [string, Puzzle][]) {
    const solType = solutionType(puzzle.solution);
    const formatHint = extractFormatHint(puzzle.description);
    const frags = solutionFragments(puzzle.solution);

    emit(`  ┌─ 謎題 [${pid}]  @${puzzle.locationId}  ─────────────────────────`);
    emit(`  │ description : ${puzzle.description}`);
    emit(`  │ solution    : ${puzzle.solution}`);
    emit(`  │ 答案類型    : ${solType}`);
    emit(`  │ format hint : ${formatHint}`);
    emit(`  │ rewardItem  : ${puzzle.rewardItemId ?? "(無)"}`);

    // reward item description — often carries next-puzzle clues
    if (puzzle.rewardItemId) {
      const ri = ws.items[puzzle.rewardItemId];
      if (ri) {
        emit(`  │   reward desc: [${ri.id}] ${ri.name} — ${ri.description}`);
      }
    }

    emit(`  │`);
    emit(`  │ 【線索掃描】★ = 含 solution 片段 (${frags.map(f => `"${f}"`).join(", ")})`);

    // Scan all items
    for (const [iid, item] of Object.entries(ws.items) as [string, Item][]) {
      const mark = likelyClue(item.description, frags) ? "★" : " ";
      const hiddenTag = item.hidden ? " [hidden-需先examine]" : "";
      const invTag = item.locationId === "inventory" ? " [inventory]" : ` @${item.locationId}`;
      emit(`  │  ${mark} 物品 [${iid}] ${item.name}${invTag}${hiddenTag}`);
      emit(`  │      "${item.description}"`);
    }

    // Scan all locations
    for (const [lid, loc] of Object.entries(ws.locations) as [string, Location][]) {
      const mark = likelyClue(loc.description, frags) ? "★" : " ";
      emit(`  │  ${mark} 房間 [${lid}] ${loc.name}`);
      emit(`  │      "${loc.description}"`);
    }

    // ── PuzzleGraph dump ──────────────────────────────────────────────────
    dumpPuzzleGraph(pid, ws.puzzleGraphs?.[pid], ws);

    emit(`  └───────────────────────────────────────────────────────────────`);
    emit();
  }

  // ── Opening narration ─────────────────────────────────────────────────────
  const openNarration = (ws.history[0]?.narration as string | undefined) ?? "";
  if (openNarration) {
    emit(`  開場旁白: ${openNarration}`);
  }
  emit();
}

// ── Batch runner ──────────────────────────────────────────────────────────────

async function runBatch(indices: number[]): Promise<void> {
  await Promise.all(
    indices.map(async (i) => {
      const theme = THEMES[i];
      const userId = `stress-test-${i + 1}`;
      process.stderr.write(`  生成 ${i + 1}/${THEMES.length}  主題: ${theme} ...\n`);
      const tStart = Date.now();
      try {
        const ws = await generateScenario(userId, { theme });
        const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
        process.stderr.write(`  ✓ ${i + 1}/${THEMES.length}  ${elapsed}s\n`);
        // Store result with index for in-order output
        results[i] = { ok: true, ws, theme };
      } catch (err) {
        const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
        process.stderr.write(`  ✗ ${i + 1}/${THEMES.length}  ${elapsed}s  ${err}\n`);
        results[i] = { ok: false, theme, err: String(err) };
      }
    }),
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

type Result =
  | { ok: true; ws: WorldState; theme: string }
  | { ok: false; theme: string; err: string };

const results: Result[] = new Array(THEMES.length);

async function main() {
  emit(`EscapeBot generator 壓力測試  ${new Date().toISOString()}`);
  emit(`共 ${THEMES.length} 場  並發 ${CONCURRENCY}  model: gemini-2.5-pro`);
  emit();

  process.stderr.write(`開始生成 ${THEMES.length} 場 (並發 ${CONCURRENCY})...\n`);

  // Process in batches
  for (let start = 0; start < THEMES.length; start += CONCURRENCY) {
    const batch = Array.from(
      { length: Math.min(CONCURRENCY, THEMES.length - start) },
      (_, k) => start + k,
    );
    await runBatch(batch);
  }

  // Dump in order
  let succeeded = 0;
  let failed = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.ok) {
      dumpScenario(i + 1, r.theme, r.ws);
      succeeded++;
    } else {
      emit(`${"═".repeat(72)}`);
      emit(`SCENE ${i + 1}  主題: ${r.theme}  ← 生成失敗`);
      emit(`錯誤: ${r.err}`);
      emit();
      failed++;
    }
  }

  emit(`${"═".repeat(72)}`);
  emit(`完成  成功 ${succeeded}  失敗 ${failed}`);

  flush();
  process.stderr.write(`\n完成  成功 ${succeeded}  失敗 ${failed}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
