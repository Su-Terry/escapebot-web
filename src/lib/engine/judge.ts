import { generateObject, NoObjectGeneratedError } from "ai";
import type { LanguageModelUsage } from "ai";
import { google } from "@ai-sdk/google";

import { VerdictSchema } from "./types";
import type { Verdict } from "./types";

const MODEL = "gemini-2.5-flash";

// ── System prompt ─────────────────────────────────────────────────────────────

const JUDGE_SYSTEM_PROMPT = `You are a strict answer evaluator for a text-adventure escape room puzzle.
You receive: the puzzle description, the correct answer (solution), and the player's attempt.
Classify the attempt as "solved", "ambiguous", or "wrong".

Rules:
- "solved": the attempt is semantically equivalent to the solution.
  Acceptable variants:
  • Minor format/punctuation differences already normalized
  • Synonyms or translations that unambiguously mean the same thing ("knowledge" = "知識")
  • Traditional/Simplified Chinese variants of the same character
- "ambiguous": the attempt is in the right semantic neighborhood but genuinely unclear.
  Use ONLY when you cannot confidently say "wrong". Examples:
  • Near-synonym where context does not disambiguate ("智慧" when answer is "知識")
  • Partial answer that might indicate the player has the right idea but wrong format
  Bias toward "wrong" — when in doubt between "ambiguous" and "wrong", prefer "wrong".
  Do not let players inch toward the answer through repeated ambiguous guesses.
- "wrong": the attempt clearly does not match. Different concept, wrong domain, etc.

The "reason" field is for server-side logging only. Be concise (one sentence).
Output only the JSON verdict object.`;

// ── Usage logging ─────────────────────────────────────────────────────────────

function logUsage(usage: LanguageModelUsage, verdict: string): void {
  console.info(
    `judge model=${MODEL} input=${usage.inputTokens ?? 0} output=${usage.outputTokens ?? 0} verdict=${verdict}`,
  );
}

// ── Judge ─────────────────────────────────────────────────────────────────────

/**
 * Semantically evaluate a player's puzzle attempt.
 * puzzle.solution is server-side only — never reaches any other LLM.
 * Returns { verdict, reason }; defaults to "wrong" on failure (safe for players).
 */
export async function judgeAnswer(
  puzzle: { id: string; description: string; solution: string },
  attemptedSolution: string,
): Promise<Verdict> {
  const prompt =
    `Puzzle description: ${puzzle.description}\n` +
    `Correct answer: ${puzzle.solution}\n` +
    `Player's attempt: ${attemptedSolution}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const tAttempt = Date.now();
    console.info(`[judge] attempt ${attempt} start puzzleId=${puzzle.id}`);
    try {
      const { object, usage } = await generateObject({
        model: google(MODEL),
        schema: VerdictSchema,
        system: JUDGE_SYSTEM_PROMPT,
        prompt,
        abortSignal: AbortSignal.timeout(25_000),
      });
      console.info(`[judge] attempt ${attempt} ok in ${Date.now() - tAttempt}ms verdict=${object.verdict}`);
      logUsage(usage, object.verdict);
      return object;
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "TimeoutError";
      const errLabel = isTimeout ? "TIMEOUT" : (err instanceof Error ? err.constructor.name : String(err));
      console.warn(`[judge] attempt ${attempt} failed in ${Date.now() - tAttempt}ms error=${errLabel}`);
      if (!isTimeout && err instanceof NoObjectGeneratedError && err.text) {
        console.warn(`[judge] attempt ${attempt} raw text (first 500): ${err.text.slice(0, 500)}`);
        try {
          const result = VerdictSchema.parse(JSON.parse(err.text));
          console.warn(`[judge] attempt ${attempt} recovered via raw parse verdict=${result.verdict}`);
          return result;
        } catch (parseErr) {
          console.warn(`[judge] attempt ${attempt} raw parse also failed: ${parseErr}`);
        }
      }
    }
  }

  console.error("judge exhausted retries, defaulting to ambiguous");
  return { verdict: "ambiguous", reason: "judge failed — ambiguous is the safe default (don't convict or acquit)" };
}
