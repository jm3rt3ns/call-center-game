# Hiring a freelance pixel artist

The manager already has a full sprite pack (`assets/sprites/bad_office_manager/`).
Everything else is drawn in code: employees fall back to the procedural pixel
drawing in `entities.js` because `CONFIG.sprites.actors.employee` is `null`, and
the office itself - floors, walls, desks, monitors, the coffee machine, the
bathroom stall - is hand-drawn in `office.js`. That is the work to hire out.

## Where to hire

**Start with [r/gameDevClassifieds](https://reddit.com/r/gameDevClassifieds).**
It is the best fit for a job this size and this specific:

- It is where working game pixel artists actually look for paid contracts, so a
  `[HIRING]` post gets replies from people who have shipped sprite sheets, not
  from generalists who will hand back a JPEG.
- You post the brief once and get portfolios back. You can see whose art already
  looks like the existing manager pack before you talk money.
- No platform cut, and you negotiate the rate and the licence directly - which
  matters here, because the art ships in a public repo and you need a clean
  buyout rather than a marketplace's default licence.

The trade-off is that you handle payment and vetting yourself. Insist on a paid
test frame (see below) and pay in milestones through PayPal Invoicing, Wise, or
Stripe Invoicing so both sides have a record.

### Backups, in the order I would try them

| Where | Good for | Watch out for |
|---|---|---|
| [r/HungryArtists](https://reddit.com/r/HungryArtists) | Same posting format, wider pool, often cheaper | Fewer artists who have done game-ready sheets and manifests |
| [Upwork](https://upwork.com) | You want escrow, contracts, and invoices handled for you | Platform fee; more filtering to reach the good pixel artists |
| [Fiverr](https://fiverr.com) (search "pixel art character animation") | Fastest to a fixed price; portfolios are right there | Fixed packages rarely match a 6-role spec; confirm IP terms explicitly |
| [Pixel Joint](https://pixeljoint.com) / [Lospec](https://lospec.com) community Discords | Finding a specific *style* first, then asking if they take commissions | Not job boards - lead with the work, not the rate |
| [itch.io](https://itch.io) asset creators | An artist whose existing packs you already like | Many only sell packs and do not take commissions |

### Ballpark rates

Sanity-check bids against roughly **$20-45/hr**, or **$40-120 per short animated
clip** at this frame size and complexity. Treat these as a range to spot outliers
in either direction, not a price list - rates move with region, experience, and
how much direction you give. A bid far under the range usually means AI output,
traced work, or someone who has not read the spec.

## How to run the hire

1. **Post the brief below.** Include the repo link and a screenshot of the game
   running. Say plainly that the art ships in a public open-source repository.
2. **Pay for one test frame.** Ask three finalists for a single employee `idle`
   frame at 48x48 on the existing palette, paid at a flat rate (roughly one
   hour's work). It costs a little and settles the style question before you
   commit to twelve animations.
3. **Sign the contract** in `docs/artist-contract.md` before Milestone 1 starts.
4. **Pay in milestones**, not all up front and not all on delivery.

## The brief

> **Pixel art for Call Center Chaos - employee character pack**
>
> Call Center Chaos is a browser-based 2D isometric office management sim
> (JavaScript, no engine). One character pack exists; I need a matching one for
> the employees, and optionally a set of office props.
>
> **Style:** 48x48 front-facing pixel art, 24-colour indexed palette (supplied as
> a `.gpl` file), feet anchored on row 45, no left/right mirroring. Reference art
> and the full spec are in the repo.
>
> **Deliverables:** 6 looping/one-shot animations - idle, walk, work (typing at a
> desk), talk, wait (arms crossed), hurt - plus a carry variant, in 2-3 visually
> distinct employee variants. Delivered as horizontal strip sheets **and**
> numbered per-frame PNGs, plus the `pack.json` manifest and the source file.
>
> **Repo:** <https://github.com/jm3rt3ns/call-center-game> - see
> `assets/sprites/README.md` for the pack format and
> `assets/sprites/bad_office_manager/` for the reference pack.
>
> Paid test frame for shortlisted artists. Contract, milestone payments, full
> buyout of the art, credited in the README unless you would rather not be.
> Please send a portfolio with animated sprite work and your rate.

## What to ask for, precisely

The pack format is documented in `assets/sprites/README.md`. The parts an artist
must match, and that are easy to get wrong:

- **48x48 cells**, laid out as a single horizontal strip per animation.
- **Origin at `x: 24, y: 45`** - the game positions a sprite by the point where
  the feet meet the floor. Art that floats or sinks is almost always this.
- **Front-facing**, with `mirrorWhenFacingLeft: false`. Side-view art flips ties
  and lanyards to the wrong side when the character turns.
- **The 24-colour palette** in `bad_office_manager.gpl`, so employees and the
  manager read as one game. New colours are fine if the artist proposes them and
  you agree - just not silently.
- **The six roles the employee code actually asks for**: `idle`, `walk`, `work`,
  `talk`, `wait`, `hurt`, plus `carry` for walking back with a coffee
  (`entities.js:362-380`). A pack missing a role falls back to its default
  animation, so a partial pack still runs - but those six are the visible ones.
- **Isometric props** (optional second package): floor tile, wall block, desk,
  monitor, coffee machine, bathroom stall. These are drawn in code today
  (`office.js`), so they are additive - the art can land without touching the
  employee work.

Once a pack lands: add it to `assets/sprites/packs.json`, point
`CONFIG.sprites.actors.employee` at its id, and run
`python3 scripts/gen-sprite-manifests.py`. No code changes are needed for a pack
that fills in the standard roles.
