#!/bin/bash
# Chrome Web Store提出用ZIPを生成するスクリプト
# staging.selectloto.jp を除いたクリーンなパッケージを作成します
#
# 使い方：
#   1. このリポジトリのフォルダをターミナルで開く
#   2. bash build_store.sh を実行
#   3. store_build/ フォルダに ZIP が生成されます

set -e

VERSION=$(grep '"version"' manifest.json | sed 's/.*"\([0-9.]*\)".*/\1/')
OUTPUT_DIR="store_build"
ZIP_NAME="${OUTPUT_DIR}/selectloto-extension-v${VERSION}.zip"

echo "▶ バージョン: v${VERSION}"
echo "▶ staging URLを除いたZIPを作成します..."

# 出力フォルダ準備
rm -rf "${OUTPUT_DIR}"
mkdir -p "${OUTPUT_DIR}"

# manifest.json からstagingを除いて一時ファイルに出力
python3 -c "
import json, sys

with open('manifest.json') as f:
    m = json.load(f)

# host_permissions から staging を除去
m['host_permissions'] = [
    h for h in m['host_permissions']
    if 'staging' not in h
]

# content_scripts の matches から staging を除去
for cs in m['content_scripts']:
    cs['matches'] = [
        match for match in cs['matches']
        if 'staging' not in match
    ]

with open('${OUTPUT_DIR}/manifest.json', 'w', encoding='utf-8') as f:
    json.dump(m, f, ensure_ascii=False, indent=2)

print('✅ manifest.json (staging除去済み) を生成しました')
"

# その他のファイルをコピー
for file in background.js content_loto_official.js content_selectloto.js popup.html popup.js; do
    cp "$file" "${OUTPUT_DIR}/"
done
cp -r icons "${OUTPUT_DIR}/"

echo "✅ ファイルをコピーしました"

# ZIP作成
cd "${OUTPUT_DIR}"
zip -r "../${ZIP_NAME}" . -x "*.DS_Store"
cd ..

echo ""
echo "✅ 完成: ${ZIP_NAME}"
echo "   → このZIPをChrome Web Storeにアップロードしてください"
