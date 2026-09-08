# Browser checks

Two scripts that drive the built app in a real browser against a stand-in city —
streets on a 120 m lattice, terrain climbing to the east — so the routing and
elevation services are never called and any variation between runs comes from
the app rather than the network.

```bash
npm run build
npx serve dist        # or any static server on http://localhost:4180/Claude-orion/
node tests/consistency.mjs     # six fresh sessions, compared
node tests/repeatability.mjs   # repeated runs in one session, and noisy GPS
```

`consistency.mjs` checks that the same inputs give the same routes, the same
instructions and the same progress every time, from a clean start.

`repeatability.mjs` covers what the first script cannot: five runs back to back
without reloading, the same again with realistic GPS noise, and repeated
searches in one session to catch slowdown or leaks. The second run in a session
is where state carried over from the first shows up — which is exactly the bug
these found.
