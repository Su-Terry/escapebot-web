import postgres from 'postgres';

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require', max: 1 });

  // 1. currentLocationId for most recent sessions
  const locs = await sql`
    SELECT u.clerk_user_id,
           ws.state->>'currentLocationId' AS current_loc,
           ws.updated_at
    FROM world_states ws
    JOIN users u ON ws.user_id = u.id
    ORDER BY ws.updated_at DESC LIMIT 3
  `;
  console.log('=== currentLocationId ===');
  console.log(JSON.stringify(locs, null, 2));

  // 2. Location names + puzzles for most recent session
  const detail = await sql`
    SELECT ws.state->'locations' AS locations,
           ws.state->'puzzles' AS puzzles,
           ws.state->'history' AS history
    FROM world_states ws
    JOIN users u ON ws.user_id = u.id
    ORDER BY ws.updated_at DESC LIMIT 1
  `;
  console.log('\n=== locations (id→name) ===');
  const lmap = detail[0].locations as Record<string, {name:string}>;
  for (const [id, v] of Object.entries(lmap)) console.log(`  ${id}: ${v.name}`);

  console.log('\n=== puzzles (id→isSolved) ===');
  const pmap = detail[0].puzzles as Record<string, {isSolved:boolean,locationId:string}>;
  for (const [id, v] of Object.entries(pmap)) console.log(`  ${id}: isSolved=${v.isSolved} loc=${v.locationId}`);

  console.log('\n=== last 5 history entries ===');
  const hist = detail[0].history as Array<{action:string,narration:string}>;
  for (const e of hist.slice(-5)) console.log(`  A: ${e.action}\n  N: ${e.narration}\n`);

  await sql.end();
}
main().catch(console.error);
