# Container vulnerability allowances

The release workflow blocks critical vulnerabilities and fixable high
vulnerabilities unless a matching, unexpired allowance exists in
[`security/vulnerability-exceptions.json`](../security/vulnerability-exceptions.json).
Each allowance identifies a CVE, Debian package name and version, rationale, and
an `expires` date. Expiration takes effect at **00:00 UTC on that date**.

Before scanning, CI runs `scripts/create-grype-config.cjs`. It emits only active
allowances into `grype-config.json`, which both Grype steps explicitly load.
Expired allowances are omitted, so their findings are evaluated against the
normal severity thresholds again. Invalid dates or incomplete allowances fail
configuration generation. Grype itself does not interpret the expiration field.
The generated configuration and available SARIF reports are retained as the
`vulnerability-reports` workflow artifact, including on scan failure.

To generate the same configuration locally:

```sh
node scripts/create-grype-config.cjs > /tmp/grype-config.json
grype IMAGE --config /tmp/grype-config.json --fail-on critical
grype IMAGE --config /tmp/grype-config.json --only-fixed --fail-on high
```

## Review of the September 15, 2026 release failure

Reviewed image:
`ghcr.io/adaliafoundation/influence-client@sha256:a1a40349b8becbe70883855ed51e858fde45a0f1a3e1ed169fece60cc10b13f9`
(linux/amd64). All allowances expire **January 1, 2027**.

The exceptions apply to the shipped Node service, not arbitrary programs added
by downstream image consumers. Reassess them if the entrypoint, native modules,
subprocess usage, or OpenSSL configuration changes.

| CVE | Affected operation | Why the shipped service is not affected |
| --- | --- | --- |
| [CVE-2026-63073](https://security-tracker.debian.org/tracker/CVE-2026-63073) | OpenSSL CMP response validation | Node v22.23.2 reports `node_shared_openssl=false`; `ldd /usr/local/bin/node` shows no Debian libssl/libcrypto linkage. The server does not invoke OpenSSL tools or load the Debian legacy provider. |
| [CVE-2026-75803](https://security-tracker.debian.org/tracker/CVE-2026-75803) | OpenSSL one-shot AEAD tag validation | Same library boundary as above. Only the Debian `libssl3t64` and `openssl-provider-legacy` packages are allowed; this is not an allowance for Node's bundled OpenSSL. |
| [CVE-2026-8376](https://security-tracker.debian.org/tracker/CVE-2026-8376) | Perl regex compilation on 32-bit builds | No Perl execution in the Node service or health check; this image's Perl also reports an 8-byte pointer size. |
| [CVE-2026-13221](https://security-tracker.debian.org/tracker/CVE-2026-13221) | Perl regex trie compilation | No Perl execution in the Node service or health check. JavaScript regular expressions use V8, not Perl. |
| [CVE-2026-42496](https://security-tracker.debian.org/tracker/CVE-2026-42496) | Perl Archive::Tar extraction | The service does not invoke Perl or extract archives through Archive::Tar. |
| [CVE-2026-12087](https://security-tracker.debian.org/tracker/CVE-2026-12087) | Perl Socket argument packing | The service does not invoke Perl Socket functions; Node networking does not use Perl. |
| [CVE-2026-57433](https://security-tracker.debian.org/tracker/CVE-2026-57433) | Perl Storable deserialization | The service does not invoke Perl or deserialize Storable data. |

No allowance was added for glibc's
[CVE-2026-5450](https://security-tracker.debian.org/tracker/CVE-2026-5450): Node
links glibc, and a source-wide native-code reachability assessment was not made.

The production stage updates eight installed Debian packages to address glibc
and the fixable high findings: `libc6`, `libc-bin`, `libssl3t64`,
`openssl-provider-legacy`, `perl-base`, `gzip`, `libpcre2-8-0`, and `libsqlite3-0`.
The OpenSSL and Perl updates also fix the allowed critical findings. Their
allowances match only the old reviewed versions, so they do not suppress
findings in the updated packages. The Node version and application dependencies
are unchanged.
