#!/bin/sh
# Tải Pikafish (engine cờ tướng) cho Linux vào ./engine. Dùng trong Dockerfile; cần curl và 7z (p7zip-full).
# LƯU Ý: pikafish.nnue không được dùng thương mại khi chưa xin phép nhóm Pikafish (xem engine/NNUE-License.md).
set -e
VERSION="2026-09-06"
URL="https://github.com/official-pikafish/Pikafish/releases/download/Pikafish-${VERSION}/Pikafish.${VERSION}.7z"
TMP="$(mktemp -d)"
curl -fsSL -o "$TMP/pikafish.7z" "$URL"
7z x -y -o"$TMP/out" "$TMP/pikafish.7z" Pikafish-Linux-x86-64-universal pikafish.nnue Copying.txt NNUE-License.md >/dev/null
mkdir -p engine
mv "$TMP/out/Pikafish-Linux-x86-64-universal" engine/pikafish-linux
mv "$TMP/out/pikafish.nnue" "$TMP/out/Copying.txt" "$TMP/out/NNUE-License.md" engine/
chmod +x engine/pikafish-linux
rm -rf "$TMP"
echo "Đã cài Pikafish ${VERSION} vào ./engine"
