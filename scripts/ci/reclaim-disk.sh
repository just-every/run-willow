#!/usr/bin/env bash
set -euo pipefail
# Rer's command/serve paths require 15 GiB free. Leave headroom without
# deleting every SDK when the hosted runner already has enough space.
for sdk in /usr/local/lib/android /usr/share/dotnet /opt/ghc /opt/hostedtoolcache/CodeQL; do
  available_kib=$(df -Pk "$GITHUB_WORKSPACE" | awk 'NR == 2 { print $4 }')
  if (( available_kib >= 20 * 1024 * 1024 )); then break; fi
  sudo rm -rf -- "$sdk"
done
df -h "$GITHUB_WORKSPACE" "$RUNNER_TEMP"
