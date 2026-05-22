# Product

## Register

product

## Users

A single operator running cold B2B outreach for a brand. The brand is not fixed: this is a white-label tool configured per deployment via the `COMPANY_NAME` / `COMPANY_ADDRESS` env vars. The operator may be a solo founder, an agency running it for a client, or a sales lead. Context of use is daytime desk work on a wide monitor: open the dashboard, check which campaigns are sending, fire a batch, read prospect replies, move on. They run the business, not the mail servers; they are not a deliverability engineer. The interface must let them trust the numbers without studying them.

## Product Purpose

A brand-agnostic, deliverability-safe cold-outreach engine with a reply inbox. It protects sending-domain reputation through daily caps, warmup ramps, domain rotation, and suppression, sends paced batches on demand, and ingests replies from each sending account so the operator sees responses in one place. The sending identity (company name, postal address) is configuration, never hardcoded. Success is: domains stay un-blacklisted, batches go out without thinking about it, and no reply is missed.

## Brand Personality

Trustworthy, calm, precise. The tool should feel like a well-built instrument, not a marketing app. Three words: dependable, exact, quiet.

## Anti-references

- Generic purple/blue SaaS dashboards (the Mailchimp / Sendgrid / generic-startup look).
- Cluttered marketing-automation UIs with feature sprawl and competing callouts.
- Flashy gradients, hero-metric tiles, decorative glassmorphism, cartoonish illustration.
- Anything that reads "AI made this": identical card grids, gradient text, side-stripe accents.

## Design Principles

- **Trust at a glance.** A count or a status must read correctly in one fixation. Caps, sent totals, and domain health are load-bearing; never decorate them into ambiguity.
- **Calm density.** Show real operational data without clutter. Whitespace and rhythm carry the hierarchy, not boxes inside boxes.
- **Earned familiarity.** Standard table / form / nav patterns. No invented affordances for routine tasks. The operator should never pause to learn a control.
- **Status is the only color.** Saturated color is reserved for state (active, paused, failed, replied). Primary actions are ink, not hue. Nothing is colored for decoration.
- **The tool disappears.** Every element serves the task in front of the operator. Personality lives in restraint and precision, not ornament.

## Accessibility & Inclusion

WCAG AA contrast for all text and status indicators. Status is never conveyed by color alone; pair every status color with a label. Visible focus rings on all interactive elements. Honor `prefers-reduced-motion`.
