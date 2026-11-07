# Documentation maintenance and evidence ownership

Review date: **2026-11-07**.

## Current entry points

`CURRENT_STATE.md`, the root README and the documentation index are the capability
entry points. Domain contracts (auth, custom doors, promotions, blog, media,
commerce/inventory), SECURITY.md and FOUNDATION.md define existing behavior and
safety invariants. The deployment runbook and OPERATIONS.md describe procedures;
procedures do not assert they have just been executed.

The November review updates active status/navigation, deployment/indexing guidance,
container-test parity, session rollout wording, custom-door full-payment and
manufacturing documentation, blog boundaries and the newsletter/test-article plan.
The Persian MCP guide describes a local installation, not a dependency of the VPS.

## Historical records and accepted design

Dated reconciliation files, handoffs, issue/branch/dependency JSON registers and old
sprint/owner/agent boards are evidence snapshots. Preserve their dates, original
results and financial/audit references. They are not a live list of open GitHub
issues or the current deployed SHA. Current pointers must identify their date and
link to CURRENT_STATE.md rather than silently changing old proof.

Accepted ADRs and stable API/domain specifications remain valid where runtime has
not changed. A documentation review does not require rewriting an unchanged
contract or falsifying a historical test count. New behavior should state which
older behavior it supersedes (for example new full-balance door payments while
legacy deposit records remain preserved).

## Release documentation checks

1. Read the exact PR head, required checks and merged main tree.
2. Verify Publish Images on the exact merged SHA; PR CI alone does not build the
   same minimal Docker context. Include required build-time test imports explicitly.
3. Verify fresh backup restoration, migrations, baseline permissions and running
   service SHA/digests before claiming deployment.
4. Check actual HTTPS pages, public/private indexing, schema and sitemap content.
5. Record operator/provider acceptance separately. Never infer paid payments,
   SMS delivery or editorial writes from a readiness response or fixture test.
6. Keep production exports, private config snapshots, credentials and raw logs out
   of documentation. Use safe PR/workflow links and aggregate verification results.

No V1 completion percentage, provider acceptance or current deployment parity is
inferred from the number of issue records or green unit tests. User instructions
set priorities; historical allocation plans do not authorize agents or releases.

## Review result

The November update checked 113 Markdown files (documentation plus root guides and
the deployment runbook) for local Markdown-link targets; no missing local targets
were found. This checks file targets, not remote-site reachability or every heading
anchor. Stable ADRs/domain contracts and dated JSON snapshots were preserved;
active entry points and behavior changes were reconciled separately.
