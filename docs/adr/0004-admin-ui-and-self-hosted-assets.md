# ADR-0004: Custom Admin UI on a Self-Hosted Vuexy Baseline

Status: Accepted — Developer B design review recorded in GitHub Issue #9

Date: 2026-08-30

## Context

The project owner supplied a locally purchased Vuexy Admin v10.11.1 package and
selected it as the starting reference for the operations application. Its relevant
starter uses Next.js, TypeScript and MUI. The upstream starter also includes demo
branding/flows, commercial design assets, remote documentation links and a Google
font integration that conflict with Iraniyaragh product ownership and the requirement
that runtime assets remain internal.

## Decision

- `apps/admin` uses Next.js App Router, strict TypeScript and MUI with RTL Emotion
  cache, matching the suitable technical baseline of the Vuexy TypeScript starter.
- Vuexy is a selective structural/reference baseline, not the owner of product UX.
- Iraniyaragh designs its own information architecture, tokens, navigation,
  components, Persian copy, accessibility behavior and operational workflows.
- Do not copy the full template, its demo content, branding, archives, design files
  or unused feature bulk into this repository.
- Fonts, icons, CSS, JavaScript and product images used by the admin runtime are
  bundled or served from controlled same-origin storage. `next/font/google`, CDNs,
  third-party icon APIs and remote telemetry/assets are forbidden.
- API and controlled object-storage origins are explicit environment/CSP exceptions;
  they are application services, not UI asset CDNs.
- A repository script scans admin source/public text assets for remote URL/font/CSS
  references and runs as part of lint/CI.
- CSP denies unlisted runtime origins. It will be tightened with nonces/hashes when
  authentication/server rendering stabilizes.
- Navigation permission keys are a temporary declarative view. They must be derived
  from or validated against the G2-04 backend RBAC registry; shipment access uses
  `shipments.read` and reporting uses `reports.read`.

## Licensing

The supplied Vuexy package declares commercial Envato licensing for design/CSS/
images. This repository remains private. Only the purchased-project use authorized
by the owner is considered; raw Vuexy distributions must not be committed or shared.
Any future direct code/asset copy requires license confirmation and an entry in
`THIRD_PARTY_NOTICES.md`.

The locally bundled Noto Sans Arabic font is under SIL Open Font License 1.1 and its
notice is stored beside the font files.

## Consequences

- The team receives a proven React admin stack without inheriting demo product
  decisions or runtime dependency on external domains.
- Developer B owns admin product/design review; Developer A owns runtime/security/
  integration foundations. Both approve shared tokens and critical workflows.
- More upfront design work is required than rebranding a full demo, but the result
  fits Iranian operators and remains maintainable.
- Template upgrades are evaluated selectively; they are never bulk-merged.
- The source scanner intentionally covers `src` and `public`; config, dependencies
  and generated output still require review. Browser Network verification remains
  G1-09A/G9-02 acceptance evidence, not something the scanner replaces.
- `sharp` installation/build approval and standalone image/runtime packaging are
  handled explicitly with the production Docker work in G1-10.

## Verification

- `pnpm --filter @iranyaragh/admin check:runtime-assets`
- `pnpm --filter @iranyaragh/admin lint`
- `pnpm --filter @iranyaragh/admin typecheck`
- `pnpm --filter @iranyaragh/admin build`
- Browser network inspection must show no third-party asset request.
- G1-09A/G9-02 must replace or justify remaining CSP `unsafe-inline` allowances
  using the final Next.js/MUI nonce/hash strategy.
