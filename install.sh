#!/usr/bin/env bash
set -euo pipefail

repository="${PAD_REPOSITORY:-WBattist/pad-local}"
version="${PAD_VERSION:-}"
machine="$(uname -m)"

case "$machine" in
  x86_64|amd64) architecture="x64" ;;
  *) echo "Pad Local currently provides Linux builds for x86_64, not $machine." >&2; exit 1 ;;
esac

asset="Pad-Local-linux.tar.gz"
if [[ -n "$version" ]]; then
  version="${version#v}"
  base_url="https://github.com/${repository}/releases/download/v${version}"
else
  base_url="https://github.com/${repository}/releases/latest/download"
fi

data_home="${XDG_DATA_HOME:-$HOME/.local/share}"
bin_directory="${HOME}/.local/bin"
application_directory="${data_home}/pad-local"
desktop_directory="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
temporary_directory="$(mktemp -d)"
trap 'rm -rf -- "$temporary_directory"' EXIT

download() {
  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 3 --silent --show-error "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$1" -O "$2"
  else
    echo "curl or wget is required to download Pad Local." >&2
    return 1
  fi
}

echo "[pad] Downloading $asset..."
download "$base_url/$asset" "$temporary_directory/$asset"

if download "$base_url/$asset.sha256" "$temporary_directory/$asset.sha256" 2>/dev/null; then
  expected="$(awk '{print $1}' "$temporary_directory/$asset.sha256")"
  actual="$(sha256sum "$temporary_directory/$asset" | awk '{print $1}')"
  [[ "$expected" == "$actual" ]] || { echo "SHA-256 verification failed." >&2; exit 1; }
  echo "[pad] SHA-256 verified."
fi

staging_directory="${application_directory}.new"
backup_directory="${application_directory}.old"
rm -rf -- "$staging_directory" "$backup_directory"
mkdir -p "$staging_directory" "$bin_directory" "$desktop_directory"
tar -xzf "$temporary_directory/$asset" -C "$staging_directory"

executable="$(find "$staging_directory" -maxdepth 2 -type f -name pad-local -print -quit)"
[[ -n "$executable" ]] || { echo "The release archive does not contain pad-local." >&2; exit 1; }
chmod +x "$executable"

if [[ -d "$application_directory" ]]; then mv "$application_directory" "$backup_directory"; fi
mv "$staging_directory" "$application_directory"
rm -rf -- "$backup_directory"

installed_executable="$(find "$application_directory" -maxdepth 2 -type f -name pad-local -print -quit)"
ln -sfn "$installed_executable" "$bin_directory/pad-local"

cat > "$desktop_directory/pad-local.desktop" <<EOF
[Desktop Entry]
Name=Pad Local
Comment=Local whiteboard and development workspace
Exec=$installed_executable
Terminal=false
Type=Application
Categories=Development;Utility;
StartupWMClass=Pad Local
EOF

echo "[pad] Pad Local is installed. Open it from your app menu or run: $bin_directory/pad-local"
