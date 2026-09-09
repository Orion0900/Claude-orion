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
node tests/route-cards.mjs     # how a route is described before it is chosen
```

`consistency.mjs` checks that the same inputs give the same routes, the same
instructions and the same progress every time, from a clean start.

`route-cards.mjs` routes through a city full of kerb jogs — the shape that used
to inflate turn counts — and checks that the scan line carries no raw tally, that
one option is named as the simplest, and that the count appears only on the
chosen route, framed as reassurance.

`repeatability.mjs` covers what the first script cannot: five runs back to back
without reloading, the same again with realistic GPS noise, and repeated
searches in one session to catch slowdown or leaks. The second run in a session
is where state carried over from the first shows up — which is exactly the bug
these found.
