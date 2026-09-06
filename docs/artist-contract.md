# Pixel art commission agreement

A short, plain-English contract for commissioning the sprite art described in
`docs/hiring-a-pixel-artist.md`. Fill in every `____`, delete the sections that
do not apply, and both sides sign before Milestone 1 starts.

*This is a template written for a small commission, not legal advice. If the
budget is large, or either party is a company rather than an individual, have a
lawyer read it. Cross-border work may bring tax and withholding obligations this
template does not cover.*

---

## Pixel Art Commission Agreement

**Client:** ____________________ ("the Client")
**Artist:** ____________________ ("the Artist")
**Project:** Call Center Chaos, a browser game at
<https://github.com/jm3rt3ns/call-center-game>
**Date:** ____________________

### 1. The work

The Artist will create original pixel art for the Project, to this specification:

**1.1 Character pack — employees**

- **____** visually distinct employee characters (default: 3).
- Each character gets these animations:

  | Animation | Frames | Loops |
  |---|---|---|
  | `idle` | 6 | yes |
  | `walk` | 8 | yes |
  | `work` (typing at a desk) | 6 | yes |
  | `talk` | 8 | yes |
  | `wait` (arms crossed) | 6 | yes |
  | `hurt` (flinching when the manager is close) | 4 | no |
  | `carry` (walking while holding a coffee) | 8 | yes |

- **Technical spec**, matching the existing `bad_office_manager` pack:
  - 48x48 pixels per frame.
  - One horizontal strip sheet per animation, one 48x48 cell per frame.
  - Character anchored so the feet sit on row 45; horizontal centre at x=24.
  - Front-facing art, readable without mirroring.
  - Drawn from the 24-colour palette in
    `assets/sprites/bad_office_manager/bad_office_manager.gpl`. The Artist may
    propose additions; the Client must agree to them in writing before they are
    used across the pack.

**1.2 Environment props — optional, only if this box is ticked: [ ]**

Isometric props matching the character style: floor tile, wall block, desk,
desk monitor, coffee machine, bathroom stall. Tile dimensions and count to be
agreed in writing before this part starts.

**1.3 Deliverables**

For each pack, the Artist delivers:

- One horizontal strip sheet per animation, as PNG with transparency.
- Numbered per-frame PNGs (`01_idle/01_idle_00.png`, `..._01.png`, and so on).
- A `pack.json` manifest in the format documented in
  `assets/sprites/README.md`.
- The editable source file (`.aseprite`, `.ase`, or layered `.psd`).
- The palette file, if it differs from the one supplied.

Files are delivered by ____________________ (e.g. a zip by email, or a pull
request to the repository).

**1.4 Acceptance**

Art is accepted when it loads and animates correctly in the game — the Client
adds the pack to `packs.json`, points `CONFIG.sprites.actors.employee` at it,
and runs `python3 scripts/gen-sprite-manifests.py`. The Client will test each
milestone and respond within **____ business days** (default: 5) with either
acceptance or a specific, written list of changes. If the Client does not
respond in that window, the milestone is treated as accepted.

### 2. Schedule and payment

**2.1 Fee.** Total fee: **____________________**, in ______ (currency).

Choose one:
- [ ] Fixed price for the whole scope in section 1.
- [ ] Hourly at ______ per hour, capped at ______ hours. The Artist will tell the
      Client before exceeding 80% of the cap; work beyond the cap needs written
      agreement.

**2.2 Milestones.**

| # | Milestone | Due | Share of fee |
|---|---|---|---|
| 1 | Style test: one `idle` animation for one character, on spec | ______ | 20% |
| 2 | First character complete, all animations | ______ | 30% |
| 3 | Remaining characters complete | ______ | 30% |
| 4 | Final files delivered and accepted, including sources | ______ | 20% |

**2.3 Payment terms.** The Client pays each milestone within **____ days**
(default: 7) of accepting it, by ____________________ (e.g. PayPal invoice,
Wise, bank transfer). Transfer fees are paid by the ____________________.

**2.4 Revisions.** Each milestone includes **____ rounds** (default: 2) of
revisions against the spec in section 1. Fixing work that does not meet that
spec is not a revision round and is not billable. New requests outside the spec
are quoted separately and agreed in writing before the Artist starts them.

**2.5 Late delivery.** If the Artist will miss a milestone date, they tell the
Client as soon as they know and propose a new date. Repeated missed dates without
notice let the Client end this agreement under section 6.

### 3. Ownership and licence

**3.1** The Artist owns the work until payment for the milestone containing it
clears.

**3.2** On payment of each milestone, the Artist assigns to the Client all
copyright and other intellectual property rights in the delivered art for that
milestone, worldwide and in perpetuity. The Client may use, modify, distribute,
sublicense, and sell it, in this Project and in any other.

**3.3 The Project is public and open source.** The Client will publish the art in
a public repository under the Project's licence, which allows others to copy and
modify it. The Artist confirms they understand and accept this.

**3.4 Portfolio rights.** The Artist may show the work in their portfolio,
social media, and showreels, and describe their role on the Project, at any time
after the Client first publishes it — or after ______ (date), whichever is
earlier.

**3.5 Credit.** The Client will credit the Artist as
"____________________" in the Project's README and in-game credits. Tick if the
Artist would rather not be credited: [ ]

**3.6 Originality.** The Artist warrants that the work is their own original
creation; that it does not copy, trace, or derive from anyone else's art, from a
purchased asset pack, or from a third party's characters or trade marks; and
that they have the right to assign it under 3.2.

**3.7 Generative AI.** Tick the option that applies:
- [ ] No generative AI. The work must be drawn by the Artist. AI image
      generators must not be used to produce or modify any delivered pixels.
- [ ] AI-assisted work is allowed where the Artist discloses in writing which
      tools were used and on which files.

Delivering AI-generated work under the first option is a material breach, and the
Client may end this agreement under section 6 and recover fees paid for the
affected milestones.

### 4. How we work together

**4.1** The Client provides the reference pack, the palette, and the repository
link, and answers questions within a reasonable time. Direction the Client gives
in writing (email or chat) counts as part of the spec.

**4.2** The Artist works independently and chooses their own hours, tools, and
methods, provided the deliverables meet section 1.

**4.3** Either party may bring in a third party (an assistant, a colourist) only
with the other's written agreement. The Artist stays responsible for anything
delivered.

### 5. Independent contractor

The Artist is an independent contractor, not an employee, partner, or agent of
the Client. The Artist is responsible for their own taxes, insurance, and any
business registration their jurisdiction requires. Nothing here creates an
exclusive relationship — both parties are free to work with others.

### 6. Ending the agreement

**6.1** Either party may end this agreement with **____ days'** written notice
(default: 14).

**6.2** If the Client ends it, the Client pays for the current milestone
pro rata for work completed, and the Artist delivers the work-in-progress files
for it. Rights to that work transfer on payment, per section 3.2.

**6.3** If the Artist ends it, the Artist delivers all work-in-progress files
and refunds any payment for work not completed.

**6.4** Sections 3 (Ownership and licence), 5 (Independent contractor), and 7
(Confidentiality) survive the end of this agreement.

### 7. Confidentiality

Neither party will share the other's private information — unreleased plans,
personal details, payment details, or unpublished work — outside what section
3.4 allows. The Project's public code and art are not confidential.

### 8. Liability

Neither party is liable to the other for indirect or consequential loss (lost
profits, lost revenue, lost data). Each party's total liability under this
agreement is limited to the total fee in section 2.1. Nothing here limits
liability for fraud, or for anything the law does not allow to be limited.

### 9. General

**9.1 Governing law.** This agreement is governed by the laws of
____________________, and both parties agree to the courts of that place.

**9.2 Disputes.** Before starting any legal action, both parties agree to talk
it through directly, in good faith, for at least 14 days.

**9.3 Whole agreement.** This document is the entire agreement between the
parties and replaces any earlier discussion. Changes must be in writing and
agreed by both.

**9.4 Severability.** If any part of this agreement is unenforceable, the rest
stays in force.

---

**Client**

Signature: ____________________  Name: ____________________  Date: __________

**Artist**

Signature: ____________________  Name: ____________________  Date: __________
