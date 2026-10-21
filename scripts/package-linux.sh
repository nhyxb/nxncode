#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v rpmbuild >/dev/null 2>&1; then
  task_tools="$PWD/.cache/rpm-tooling"
  if [[ ! -x "$task_tools/root/usr/bin/rpmbuild" ]]; then
    mkdir -p "$task_tools/root"
    dnf download --arch=x86_64 --destdir "$task_tools" rpm-build rpm-build-libs
    for task_rpm in "$task_tools"/*x86_64.rpm; do
      rpm2cpio "$task_rpm" | (cd "$task_tools/root" && cpio -idm --quiet)
    done
  fi
  export PATH="$task_tools/root/usr/bin:$PATH"
fi
# Reuse the exact runtime already installed by the lockfile; do not redownload it.
exec pnpm exec electron-builder --linux rpm AppImage --config.electronDist=node_modules/electron/dist

