# Sourced by the other scripts: the published Eider toolchain and access to the private
# library repositories.
#
# - `eider` from ~/.eider/bin (eider-lang's install.sh); the toolchain is the one
#   eider.toml's `eider = "0.4"` asks for (`eider toolchain show`).
# - The private repositories: eider downloads toolchains, and eider-pkg fetches the git
#   dependencies, with a token of their own finding (GH_TOKEN, else GITHUB_TOKEN, else
#   `gh auth token`; eider-lang#142), so nothing is set up here.

ROOT=$(cd "$(dirname "$0")/.." && pwd)
export PATH="$HOME/.eider/bin:$PATH"

if ! command -v eider >/dev/null 2>&1; then
    echo "eider is not installed: download install.sh from the latest klxdev/eider-lang release and run \`sh install.sh --toolchain\`" >&2
    exit 2
fi

step() { printf '\n== %s\n' "$*"; }
