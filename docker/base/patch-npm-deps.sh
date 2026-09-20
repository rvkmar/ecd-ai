#!/bin/sh
# Patch High CVEs in the npm CLI nested deps shipped with official node alpine.
# Do NOT run `npm install` inside npm's own package.json (pulls private @npmcli/*).
set -e

NPM_NM=/usr/local/lib/node_modules/npm/node_modules
WORKDIR=/tmp/npm-cve-patch
rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"
cd "$WORKDIR"

npm pack brace-expansion@5.0.9 >/dev/null
npm pack tar@7.5.21 >/dev/null
npm pack ip-address@10.3.1 >/dev/null

install_tgz() {
  target="$1"
  tgz="$2"
  rm -rf "$NPM_NM/$target"
  mkdir -p "$NPM_NM/$target"
  tar -xzf "$tgz" -C "$NPM_NM/$target" --strip-components=1
  echo "installed $target from $tgz"
}

install_tgz brace-expansion brace-expansion-5.0.9.tgz
install_tgz tar tar-7.5.21.tgz
install_tgz ip-address ip-address-10.3.1.tgz

npm cache clean --force
rm -rf "$WORKDIR"

B=$(node -p "require('$NPM_NM/brace-expansion/package.json').version")
T=$(node -p "require('$NPM_NM/tar/package.json').version")
I=$(node -p "require('$NPM_NM/ip-address/package.json').version")
echo "patched: brace-expansion=$B tar=$T ip-address=$I"

test "$B" = "5.0.9"
test "$T" = "7.5.21"
test "$I" = "10.3.1"
