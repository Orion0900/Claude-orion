# Sana's CRE Game

Run a commercial real estate private equity firm. Start with a $150M first
fund, buy buildings, fix them up, survive the cycle, give LPs their money
back and raise the next fund, bigger. Every building you own stands on your
skyline: lit windows are occupancy, a crane means a business plan is under
way, and the sky follows the economy.

## Playing it

Once the site is deployed (see below), open
**https://orion0900.github.io/Claude-orion/sanas-cre-game/**. It plays on a
phone or a desktop, in light or dark mode, and saves as you go.

On an iPhone, open it in **Safari**, tap **Share**, then **Add to Home
Screen**: it gets its own icon, launches full screen and keeps working
offline.

### Deploying it

Every push to `main` runs
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), which builds
the game into `/sanas-cre-game/` on the GitHub Pages site next to the others.
Merging is the only step.

## A career

Each turn is a quarter, from Q1 2027, for a 10, 15 or 20 year career.

- **Deals.** Brokers send listings every quarter: apartments, warehouses,
  offices, shopping centers, hotels, data centers, self-storage and labs, in
  thirteen markets from New York to Phoenix. Each has a seller with a reason
  to sell, a rent roll, a condition and some competition.
- **Underwriting.** Open a deal and model it the way an acquisitions team
  would: your bid, a business plan (hold, value-add or a full repositioning),
  fixed-rate or bridge debt and the loan-to-value. Inputs are blue, like every
  real estate model. It shows sources and uses, the levered IRR and multiple,
  yield on cost, coverage and the sensitivity grid to exit cap and rent growth.
  The broker's pro forma is there too, a few points higher, as it always is.
- **Bidding.** Wide auctions get bid up to what the keenest rival will accept;
  off-market, distressed and motivated sellers are where the bargains are.
  Close bids go to best and final. Win, order diligence to find what the seller
  didn't mention, re-trade the price or walk, then close.
- **Asset management.** Leases roll to market rent, occupancy drifts toward
  what the market will hold, and quality slips every year. Renovations lift
  rents and occupancy but take space offline. Refinance to pull cash out, sell
  when a buyer pays up, or hand the keys back to the lender.
- **Decisions.** Anchor tenants asking for discounts, failed chillers,
  unsolicited offers, tax reassessments, hurricanes, union contracts, rivals
  poaching your team, a GP-stakes fund that wants a piece of the firm. Each
  has to be answered before the quarter can end.
- **Funds.** A fund buys for three years and sells within seven, with up to
  two one-year extensions. The management fee pays the firm; carried interest
  comes only after LPs get their capital back and an 8% preferred return,
  through a real whole-fund waterfall with a GP catch-up. Net IRR, TVPI, DPI
  and the J-curve are tracked for every fund.
- **Fundraising.** Once a fund is two years old and 70% committed, take the
  next one on the road. LPs weigh your net returns against the strategy's
  target, cash actually returned, your reputation and the size of the jump.
  A raise takes three quarters, with anchor LPs, side letters and an optional
  placement agent.
- **The firm.** Hire acquisitions (more and better deals), asset management
  (better execution), investor relations (bigger raises) and research (finds
  hidden problems, reads the cycle). Run out of cash two quarters running and
  the firm folds.
- **The score.** At retirement: the firm's cash, the GP's own stake in its
  funds, carry still to come and the management company at eight times fee
  earnings. Titles run from Emerging Manager to Real Estate Legend, scaled to
  the career's length, and the best careers go in the hall of fame.

## How the market works

- **The cycle.** Recovery, expansion, late cycle and recession, each with its
  own Fed target, inflation, credit spreads, lender leverage and LP appetite.
  Expansions get likelier to end the older they get. Rare shocks (a pandemic,
  a banking crisis, an inflation scare) can arrive at any time.
- **Rates.** The Fed moves in quarter points toward where the phase wants it.
  The 10-year follows halfway, plus a wandering term premium, and cap rates
  move about two-thirds as much as the 10-year.
- **Storylines.** Each career opens on the market going into 2027: hybrid work
  hollowing out offices, a Sunbelt apartment supply wave, the AI data center
  build-out, a lab glut. New stories arrive at random (return-to-office,
  nearshoring, rent control, retailer bankruptcies, a travel boom) and some
  set up their own sequel.
- **Buildings.** Rent comes from the leases in place, which reprice toward
  market at each sector's own pace: apartments every year, offices over a
  decade, hotels every night. New leases cost commissions and improvements in
  years of rent. Appraisals capitalize in-place income plus part of the climb
  to stabilized, less the cost of leasing the vacancy.
- **Debt.** Fixed-rate lenders size on today's income at 1.25x coverage and
  charge yield maintenance to prepay. Bridge lenders size on stabilized income
  at a 7.5% debt yield, float with the Fed and extend only if the building
  covers its interest. Every loan matures, and in a recession refinancing can
  cost equity. A fund whose commitments run out draws a credit line; past 15%
  of the fund, the bank forces sales.
- **Rivals.** Six other firms grow with the cycle, win the deals you lose and
  make the news. The league table ranks everyone by assets under management.

The house view in the underwriting model uses the same operating model as the
game itself, just without the surprises: it holds rates where they are, lets
rent growth fade to its long-run trend and sells 25 bp wider than today.

## Data

Everything stays in the browser, in its own storage. Nothing is sent anywhere.
A seed is shown on the Firm screen; the same seed and the same choices always
play out the same way.

## Development

```sh
cd sanas-cre-game
npm install
npm run dev            # http://localhost:5173
npm test               # the engine: waterfall, IRR, pricing, loans, whole careers played by a bot
npm run build
node tests/smoke.mjs   # after a build: plays twelve quarters through the screens on a phone-sized browser
npm run icons          # redraws the icons with Playwright's Chromium
node scripts/build-artifact.mjs out.html   # the whole game as one self-contained page
```

The engine (`src/engine/`) is plain TypeScript with no browser in it: every
turn and action takes the game state and returns a new one. `bot.ts` is a
simple, disciplined player the tests and balance checks use.
