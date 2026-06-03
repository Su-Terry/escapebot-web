/**
 * Judge boundary test — calls production judgeAnswer with edge-case player inputs.
 * Does NOT modify judge. Output: solution / attempt / verdict / reason.
 *
 * Usage: pnpm tsx scripts/test-judge.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { judgeAnswer } from "../src/lib/engine/judge";

interface Case {
  group: string;
  puzzleId: string;
  description: string;
  solution: string;
  attempt: string;
  note: string; // what we expect or why this is interesting
}

const CASES: Case[] = [
  // ── 順序類 ───────────────────────────────────────────────────────────────
  {
    group: "順序",
    puzzleId: "animal-order",
    description: "依牆上銘文「天空、沙漠、草原、尼羅河的主宰」順序，輸入動物名稱，以空格分隔。",
    solution: "鷹 蛇 獅 鱷",
    attempt: "鷹 鱷 獅 蛇",
    note: "兩個位置互換",
  },
  {
    group: "順序",
    puzzleId: "animal-order",
    description: "依牆上銘文「天空、沙漠、草原、尼羅河的主宰」順序，輸入動物名稱，以空格分隔。",
    solution: "鷹 蛇 獅 鱷",
    attempt: "獅 鷹 蛇 鱷",
    note: "完全打亂",
  },
  {
    group: "順序",
    puzzleId: "spice-order",
    description: "依配方順序輸入兩種材料，以空格分隔。",
    solution: "硫磺 鹽",
    attempt: "鹽 硫磺",
    note: "完全反序",
  },
  {
    group: "順序",
    puzzleId: "direction-order",
    description: "按指南針的順時針方向輸入四個方位，不需分隔。",
    solution: "北東南西",
    attempt: "東南西北",
    note: "循環位移（起點不同但順序相同）",
  },
  {
    group: "順序",
    puzzleId: "direction-order",
    description: "按指南針的順時針方向輸入四個方位，不需分隔。",
    solution: "北東南西",
    attempt: "北 東 南 西",
    note: "加空格",
  },
  {
    group: "順序",
    puzzleId: "color-order",
    description: "依旗幟上從左到右的顏色順序輸入，不需分隔。",
    solution: "綠紅藍黃",
    attempt: "綠 紅 藍 黃",
    note: "加空格",
  },

  // ── 近義/字詞轉換類 ──────────────────────────────────────────────────────
  {
    group: "近義",
    puzzleId: "night-sky",
    description: "日誌最後一行寫著「凝視著夜空，心中湧起無限嚮往」。密碼是那片夜空的中文名稱，需要輸入2個字。",
    solution: "星空",
    attempt: "夜空",
    note: "謎題描述裡就寫了「夜空」——這正是發散高發區",
  },
  {
    group: "近義",
    puzzleId: "symbol-order",
    description: "依圖騰柱上的符號順序輸入三個詞語，以空格分隔。",
    solution: "狼 日 海",
    attempt: "狼 太陽 海浪",
    note: "圖案畫的是太陽、海浪，玩家用視覺描述",
  },
  {
    group: "近義",
    puzzleId: "diary-word",
    description: "日記最後一頁潦草地寫著：「自由是我的___」。填入那個詞語。",
    solution: "嚮往",
    attempt: "自由",
    note: "玩家複誦謎題描述裡的詞，沒填上那個空",
  },
  {
    group: "近義",
    puzzleId: "diary-word",
    description: "日記最後一頁潦草地寫著：「自由是我的___」。填入那個詞語。",
    solution: "嚮往",
    attempt: "夢想",
    note: "近義但不同詞",
  },

  // ── 格式變體類 ───────────────────────────────────────────────────────────
  {
    group: "格式",
    puzzleId: "num-code",
    description: "保險箱需要輸入 4 位數密碼。",
    solution: "7319",
    attempt: "73 19",
    note: "中間加空格",
  },
  {
    group: "格式",
    puzzleId: "num-code",
    description: "保險箱需要輸入 4 位數密碼。",
    solution: "7319",
    attempt: "7,3,1,9",
    note: "逗號分隔每位",
  },
  {
    group: "格式",
    puzzleId: "alphanum-code",
    description: "電腦終端要求輸入登入代碼。",
    solution: "OCEAN365",
    attempt: "ocean365",
    note: "全小寫",
  },
  {
    group: "格式",
    puzzleId: "alphanum-code",
    description: "電腦終端要求輸入登入代碼。",
    solution: "OCEAN365",
    attempt: "OCEAN 365",
    note: "字母與數字間加空格",
  },
  {
    group: "格式",
    puzzleId: "room-code",
    description: "門牌號碼格式為「區號-房號」，輸入完整門牌。",
    solution: "404-B212",
    attempt: "404 B212",
    note: "連字號換空格",
  },
  {
    group: "格式",
    puzzleId: "room-code",
    description: "門牌號碼格式為「區號-房號」，輸入完整門牌。",
    solution: "404-B212",
    attempt: "404B212",
    note: "無分隔符",
  },

  // ── 正確對照 ─────────────────────────────────────────────────────────────
  {
    group: "對照",
    puzzleId: "num-ctrl",
    description: "保險箱需要輸入 4 位數密碼。",
    solution: "7319",
    attempt: "7319",
    note: "完全正確 → 應 solved",
  },
  {
    group: "對照",
    puzzleId: "animal-ctrl",
    description: "依牆上銘文「天空、沙漠、草原、尼羅河的主宰」順序，輸入動物名稱，以空格分隔。",
    solution: "鷹 蛇 獅 鱷",
    attempt: "鷹 蛇 獅 鱷",
    note: "完全正確 → 應 solved",
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Judge 邊界測試  ${new Date().toISOString()}`);
  console.log(`共 ${CASES.length} 組  model: gemini-2.5-flash\n`);

  let currentGroup = "";

  for (const c of CASES) {
    if (c.group !== currentGroup) {
      currentGroup = c.group;
      console.log(`\n${"─".repeat(60)}`);
      console.log(`## ${currentGroup}類`);
      console.log("─".repeat(60));
    }

    process.stderr.write(`  judging [${c.group}] ${JSON.stringify(c.attempt)} ...\r`);
    const tStart = Date.now();

    try {
      const verdict = await judgeAnswer(
        { id: c.puzzleId, description: c.description, solution: c.solution },
        c.attempt,
      );
      const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);

      const verdictLabel =
        verdict.verdict === "solved"
          ? "✅ solved  "
          : verdict.verdict === "ambiguous"
            ? "⚠️  ambiguous"
            : "❌ wrong   ";

      console.log(`\nsolution : ${c.solution}`);
      console.log(`attempt  : ${c.attempt}`);
      console.log(`備註     : ${c.note}`);
      console.log(`verdict  : ${verdictLabel}  (${elapsed}s)`);
      console.log(`reason   : ${verdict.reason}`);
    } catch (err) {
      console.log(`\nsolution : ${c.solution}`);
      console.log(`attempt  : ${c.attempt}`);
      console.log(`備註     : ${c.note}`);
      console.log(`verdict  : 💥 ERROR — ${err}`);
    }
  }

  process.stderr.write("                                        \r"); // clear progress line
  console.log(`\n${"─".repeat(60)}`);
  console.log("完成");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
