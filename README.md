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
