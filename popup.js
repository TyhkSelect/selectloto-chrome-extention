document.addEventListener('DOMContentLoaded', async () => {
  const content = document.getElementById('content');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isSelectlotoPage =
    tab?.url?.includes('selectloto.jp') ||
    tab?.url?.includes('saved_history_by_round_detail');

  if (!isSelectlotoPage) {
    content.innerHTML =
      '<div class="msg error">selectloto.jp の<br>抽せん回詳細ページで開いてください</div>';
    return;
  }

  let result;
  try {
    result = await chrome.tabs.sendMessage(tab.id, { type: 'GET_COMBINATIONS' });
  } catch {
    content.innerHTML =
      '<div class="msg error">データを読み込めませんでした。<br>ページを再読み込みしてください。</div>';
    return;
  }

  if (!result) {
    content.innerHTML =
      '<div class="msg error">データを読み込めませんでした。<br>ページを再読み込みしてください。</div>';
    return;
  }

  if (result.error === 'drawn') {
    content.innerHTML =
      '<div class="msg error">この抽せん回はすでに抽選済みです。<br>未抽選の回のページで開いてください。</div>';
    return;
  }

  const { lotteryType, drawRound, combinations } = result;

  if (!combinations || combinations.length === 0) {
    content.innerHTML = '<div class="msg">組み合わせデータがありません</div>';
    return;
  }

  content.innerHTML = `
    <div class="subtitle">第${drawRound}回 ／ ${combinations.length}組</div>
    <div class="toolbar">
      <button id="select50">50組を選択</button>
      <button id="selectAll">全解除</button>
    </div>
    <div class="combo-list" id="comboList"></div>
    <div class="actions">
      <button id="startBtn">確認画面に進む</button>
    </div>
    <div class="warning-note">
      公式サイトで一度に入力できるのは <strong>50組まで</strong> です。<br>
      50組を超える場合は、<strong>50組ごとに購入（支払い）手続き</strong>が必要になります。
    </div>
    <div class="status" id="status"></div>
  `;

  const comboList = document.getElementById('comboList');
  combinations.forEach((combo, i) => {
    const div = document.createElement('div');
    div.className = 'combo-item';
    const nums = combo.numbers
      .map(n => `<span class="num-chip">${String(n).padStart(2, '0')}</span>`)
      .join('');
    div.innerHTML = `
      <input type="checkbox" id="c${i}" ${i < 50 ? 'checked' : ''} data-index="${i}">
      <span class="combo-index">${i + 1}</span>
      <label for="c${i}" class="combo-numbers">${nums}</label>
      <span class="kuchi-badge">${combo.kuchiCount}口</span>
      <span class="set-label">S${combo.setNumber}</span>
    `;
    comboList.appendChild(div);
  });

  // チェックボックスの変更イベント：50組以上選択できないようにする
  document.querySelectorAll('#comboList input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const checked = document.querySelectorAll('#comboList input[type="checkbox"]:checked').length;
      if (checked > 50) {
        cb.checked = false;
        document.getElementById('status').textContent = '⚠️ 50組までしか選択できません';
      }
    });
  });

  // 50組を選択（チェック済みの最初の組から50個）
  document.getElementById('select50').addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('#comboList input[type="checkbox"]');

    // チェックされている最初のインデックスを見つける
    let startIdx = -1;
    for (let i = 0; i < checkboxes.length; i++) {
      if (checkboxes[i].checked) {
        startIdx = i;
        break;
      }
    }

    // チェックが1つもない場合は0から開始
    if (startIdx === -1) {
      startIdx = 0;
    }

    // startIdx から50個をチェック
    const endIdx = Math.min(startIdx + 50, checkboxes.length);
    checkboxes.forEach((cb, idx) => {
      cb.checked = (idx >= startIdx && idx < endIdx);
    });

    document.getElementById('status').textContent =
      `${startIdx + 1}～${endIdx}番目を選択しました (${endIdx - startIdx}組)`;
  });

  // 全解除：すべてのチェックを外す
  document.getElementById('selectAll').addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('#comboList input[type="checkbox"]');
    checkboxes.forEach(cb => (cb.checked = false));
    document.getElementById('status').textContent = '';
  });

  document.getElementById('startBtn').addEventListener('click', async () => {
    const selected = [...document.querySelectorAll('#comboList input[type="checkbox"]:checked')].map(
      cb => combinations[parseInt(cb.dataset.index)]
    );

    const statusEl = document.getElementById('status');
    if (selected.length === 0) {
      statusEl.textContent = '組み合わせを選択してください';
      return;
    }

    // 抽せん回確認ダイアログを表示
    const confirmed = await showConfirmDialog(drawRound, selected.length, selected);
    if (!confirmed) return;

    await chrome.storage.local.set({
      selectloto_autofill: {
        lotteryType: lotteryType ?? 'loto6',
        drawRound,
        combinations: selected,
        timestamp: Date.now(),
      },
    });

    // 補助画面に戻らず、そのまま公式サイトの購入ページへ進む
    const urls = {
      loto6: 'https://www.takarakuji-official.jp/ec/loto6/',
      loto7: 'https://www.takarakuji-official.jp/ec/loto7/',
      miniloto: 'https://www.takarakuji-official.jp/ec/miniloto/'
    };
    const url = urls[lotteryType ?? 'loto6'] || urls.loto6;
    chrome.tabs.create({ url });
  });
});

// 抽せん回確認ダイアログ
function showConfirmDialog(drawRound, count, selected) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';

    // 選択した数字を一覧表示
    const numbersList = selected
      .map((combo, idx) => `<div style="font-size:12px;margin:4px 0;"><strong>${idx + 1}.</strong> ${combo.numbers.join(', ')} (${combo.kuchiCount}口)</div>`)
      .join('');

    overlay.innerHTML = `
      <div class="confirm-box">
        <div class="confirm-title">⚠️ 抽せん回の確認</div>
        <div class="confirm-round">第 ${drawRound} 回</div>
        <div class="confirm-count">${count}組を公式サイトへ入力します</div>
        <div class="confirm-note" style="max-height:150px;overflow-y:auto;text-align:left;padding:8px;">
          <strong>選択した数字一覧：</strong><br>
          ${numbersList}
        </div>
        <div class="confirm-buttons">
          <button class="btn-cancel" id="confirmBack">前の画面に戻る</button>
          <button class="btn-confirm" id="confirmOk">公式サイトでの購入へ進む</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('confirmBack').addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });

    document.getElementById('confirmOk').addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });
  });
}
