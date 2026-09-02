# Security Policy

Iraniyaragh is under active pre-release development. Security reports are welcome,
but vulnerabilities and suspected credentials must not be disclosed in a public
issue, discussion or pull request.

## Supported versions

Only the current `main` branch is supported. No production release has been
published yet. Historical branches, prototypes and unmerged pull requests may be
used as evidence, but fixes target `main` and supported release branches only.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting form:

<https://github.com/Hordekiller/Iraniyaragh/security/advisories/new>

Include, when safely possible:

- the affected commit, route, workflow or component;
- impact and realistic attacker prerequisites;
- minimal reproduction steps or a proof of concept using synthetic data;
- whether secrets, personal data, authorization, inventory or money are involved;
- a suggested mitigation, if known.

Do not include real credentials, personal data or production records. If a secret
may be exposed, stop testing, avoid copying it, and state only its type and location
in the private report. Maintainers will rotate or revoke it before discussing code
changes.

## Response targets

The maintainers aim to:

- acknowledge a report within three working days;
- complete initial severity and scope triage within seven working days;
- provide an update at least every seven working days while remediation is active;
- coordinate disclosure after a fix or documented mitigation is available.

These are response targets, not a guarantee. Critical reports involving active
credentials, unauthorized access or data integrity receive priority.

## Safe research expectations

- Test only against systems and accounts you own or have explicit permission to use.
- Use synthetic data and the local/test environment where possible.
- Do not degrade availability, send unsolicited messages, or access another person's data.
- Do not exploit a finding beyond the minimum needed to demonstrate impact.
- Give maintainers a reasonable opportunity to investigate and remediate before disclosure.

Good-faith reports following these expectations will be handled collaboratively.
