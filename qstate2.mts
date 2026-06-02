import postgres from 'postgres';
async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require', max: 1 });
  const [row] = await sql`
    SELECT ws.state AS s
    FROM world_states ws JOIN users u ON ws.user_id = u.id
    ORDER BY ws.updated_at DESC LIMIT 1
  `;
  const s = row.s as any;

  // Locations with locks
  console.log('=== locations + locks ===');
  for (const [id, loc] of Object.entries(s.locations as Record<string, any>)) {
    console.log(`  ${id} (${loc.name}): lockedByPuzzleIds=${JSON.stringify(loc.lockedByPuzzleIds)}`);
  }

  // Puzzle actual solution
  console.log('\n=== puzzles (solution + isSolved) ===');
  for (const [id, p] of Object.entries(s.puzzles as Record<string, any>)) {
    console.log(`  ${id}: solution="${p.solution}" isSolved=${p.isSolved}`);
  }

  // Full history (action + stateChanges not available, but show all narration)
  console.log('\n=== full history ===');
  const hist = s.history as Array<{action:string, narration:string}>;
  hist.forEach((e, i) => console.log(`[${i}] A: ${e.action || '(開場)'}\n    N: ${e.narration}\n`));

  await sql.end();
}
main().catch(console.error);
