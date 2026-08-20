#!/usr/bin/env bash
# Link the harness's own modules into each Magna plugin package.
#
# Why this exists: `dsh plugin --profile web add ./packages/os` installs a local
# directory with pnpm's `link:` protocol. The package therefore stays where it
# is in this repo, and Node resolves its imports by walking up from HERE — it
# never reaches the profile's module farm at $DSH_HOME/profiles/node_modules.
# (That farm works for packages installed from the registry, which physically
# live under the profile. It does not help a linked one.)
#
# Linking rather than installing a second copy is deliberate: two copies of
# cordis would mean two `Service` base classes, and a service registered against
# one would be invisible to code holding the other.
#
# Re-run after adding a new package under packages/, or after reinstalling dsh.
set -euo pipefail

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
FARM="$DSH_HOME/profiles/node_modules/@deepseek-ai"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# The modules a Magna plugin is allowed to import from the harness. Keep this
# list short — every entry is coupling.
DEPS=(cordis dsh-tools)

# Unscoped modules from the same farm. `zod` is here because storage domains
# declare their record schemas in it: ctx.storageDomain validates at the durable
# boundary against a zod schema, so a package that persists anything needs the
# harness's own copy. Taking a second copy from npm would be worse than the
# duplicate-cordis problem it looks like — the schemas would still work, but
# they would be instances of a different zod, and the validator's `instanceof`
# checks would reject them.
BARE_DEPS=(zod)

if [ ! -d "$FARM" ]; then
  echo "link-harness: no module farm at $FARM" >&2
  echo "              run 'dsh plugin --profile web add ./packages/os' once first," >&2
  echo "              or set DSH_HOME if the harness lives elsewhere." >&2
  exit 1
fi

linked=0
for pkg in "$REPO"/packages/*/; do
  [ -f "$pkg/package.json" ] || continue
  target="$pkg/node_modules/@deepseek-ai"
  mkdir -p "$target"
  for dep in "${DEPS[@]}"; do
    if [ ! -e "$FARM/$dep" ]; then
      echo "link-harness: $FARM/$dep is missing — is the harness installed?" >&2
      exit 1
    fi
    ln -sfn "$FARM/$dep" "$target/$dep"
    linked=$((linked + 1))
  done
  for dep in "${BARE_DEPS[@]}"; do
    if [ ! -e "$FARM/../$dep" ]; then
      echo "link-harness: $dep is missing from the farm — is the harness installed?" >&2
      exit 1
    fi
    ln -sfn "$FARM/../$dep" "$pkg/node_modules/$dep"
    linked=$((linked + 1))
  done
  echo "  linked $(( ${#DEPS[@]} + ${#BARE_DEPS[@]} )) into $(basename "$pkg")"
done

echo "link-harness: $linked link(s) from $FARM"

# A linked package with its own npm lockfile makes pnpm re-resolve the profile,
# and a `link:` entry it cannot verify gets dropped — which is how @magna/app-docs
# silently vanished from the profile after app-mail was installed. Any real
# dependency a package needs (imapflow, mailparser) is installed into its own
# node_modules; the lockfile is the part that must not survive.
for pkg in "$REPO"/packages/*/; do
  if [ -f "$pkg/package-lock.json" ]; then
    echo "link-harness: removing $(basename "$pkg")/package-lock.json (the profile is pnpm)"
    rm -f "$pkg/package-lock.json"
  fi
done
