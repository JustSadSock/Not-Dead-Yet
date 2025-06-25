# Not-Dead-Yet

## Connectivity Test

Run a small script to verify that two adjacent chunks share a corridor at their common edge:

```bash
node scripts/testChunkConnectivity.js
```

The script exits with a non-zero status if no connecting corridor is found.

## Regeneration Connectivity Test

Verify that corridor connections survive chunk regeneration:

```bash
node scripts/testRegenerationConnectivity.js
```

This script exits with a non-zero status if the connection is lost after regeneration.

## Multi-Edge Regeneration Test

Test corridor connections on all four sides of the starting chunk and ensure they persist after repeatedly regenerating the adjacent chunks:

```bash
node scripts/testMultiEdgeRegeneration.js
```

The script regenerates each neighbouring chunk several times and exits with a non-zero status if any corridor connection disappears.

## Geometry Consistency Test

Generate a few chunks and verify basic geometric invariants:

```bash
node scripts/testGeometry.js
```

The script fails if corridor width is not two tiles everywhere or if any room cell lacks a surrounding wall where no door is present.

## Regenerating with a Different Layout

Both `ensureChunk` and `regenerateChunksPreserveFOV` accept an optional
`extraSeed` parameter. Passing a different value forces the procedural generator
to build a new layout for the chunk:

```javascript
const key = '1,0';
gameMap.regenerateChunksPreserveFOV(new Set([key]), computeFOV, player, Date.now());
```

Use any integer value for `extraSeed` to trigger a fresh layout when the chunk
is regenerated.
