# Dependency decisions

The project uses npm and commits `package-lock.json`. All direct versions are
exact so a clean installation reproduces the tested toolchain.

No framework downgrade was made. React remains 19.2.6, Tailwind remains 4.1.17
and the existing Next.js 16 line is retained. Next.js was raised from 16.2.6 to
16.2.12 and PostCSS from 8.5.8 to 8.5.18 because `npm audit` reported published
security advisories fixed by compatible patch releases. Vitest and Zustand had
their range operators removed to prevent unreviewed upgrades.

`turbopack.root` is explicitly set to this project so a parent lock file cannot
change dependency discovery. Database construction is lazy: production
persistence still requires `DATABASE_URL`, while compilation and the local
engine do not.

Remaining audit findings in development-only ESLint/Drizzle transitive packages
are not addressed with the registry's suggested major downgrades. They should be
revisited when upstream compatible releases are available.

On 2026-07-29 the registry also reported high-severity advisories in the
PostCSS 8.4.31 and Sharp 0.34.5 copies nested under Next.js. npm's automated
proposal was a breaking downgrade to Next.js 9.3.3, so package overrides pin
Next's transitive copies to PostCSS 8.5.18 and Sharp 0.35.0. The complete
typecheck, test, lint and production-build gates are run against those resolved
versions.
