# Sourced by the other scripts: the published Eider toolchain and access to the private
# library repositories.
#
# - `eider` from ~/.eider/bin (eider-lang's install.sh); the toolchain is the one
#   eider.toml's `eider = "0.2"` asks for (`eider toolchain show`).
# - GH_TOKEN: eider downloads toolchains with it, but eider-pkg fetches git dependencies
#   with plain `git`, which doesn't read it (filed as klxdev/eider-lang#142). So for
#   github.com, git gets one more credential helper, through the environment only, that
#   answers with $GH_TOKEN. Your own git configuration is not changed.

ROOT=$(cd "$(dirname "$0")/.." && pwd)
export PATH="$HOME/.eider/bin:$PATH"

if ! command -v eider >/dev/null 2>&1; then
    echo "eider is not installed: download install.sh from the latest klxdev/eider-lang release and run \`sh install.sh --toolchain\`" >&2
    exit 2
fi
if [ -z "${GH_TOKEN:-}" ] && command -v gh >/dev/null 2>&1; then
    GH_TOKEN=$(gh auth token 2>/dev/null || true)
fi
export GH_TOKEN
if [ -n "${GH_TOKEN:-}" ]; then
    n=${GIT_CONFIG_COUNT:-0}
    export GIT_CONFIG_COUNT=$((n + 1))
    export "GIT_CONFIG_KEY_$n=credential.https://github.com.helper"
    export "GIT_CONFIG_VALUE_$n=!f() { test \"\$1\" = get && echo username=x-access-token && echo \"password=\$GH_TOKEN\"; }; f"
fi

step() { printf '\n== %s\n' "$*"; }
