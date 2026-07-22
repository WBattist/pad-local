#!/usr/bin/env bash
set -euo pipefail

repository="${PAD_REPOSITORY:-WBattist/pad-local}"
branch="${PAD_BRANCH:-main}"
install_root="${XDG_DATA_HOME:-$HOME/.local/share}/pad-local"
bin_dir="${HOME}/.local/bin"
tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "$tmp_dir"' EXIT

command -v docker >/dev/null || { echo "Docker Engine is required." >&2; exit 1; }
docker compose version >/dev/null || { echo "Docker Compose v2 is required." >&2; exit 1; }

curl -fsSL "https://github.com/${repository}/archive/refs/heads/${branch}.tar.gz" -o "$tmp_dir/pad.tar.gz"
mkdir -p "$tmp_dir/source" "$install_root" "$bin_dir"
tar -xzf "$tmp_dir/pad.tar.gz" -C "$tmp_dir/source" --strip-components=1
cp -a "$tmp_dir/source/." "$install_root/"
cat > "$bin_dir/pad" <<EOF
#!/usr/bin/env bash
exec pwsh -NoLogo -NoProfile -File "$install_root/scripts/pad.ps1" "\$@"
EOF
chmod +x "$bin_dir/pad"
echo "Pad Local installed. Ensure $bin_dir is on PATH, then run: pad"
