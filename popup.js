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
      <button id="selectAll">全選択 / 解除</button>
    </div>
    <div class="combo-list" id="comboList"></div>
    <div class="actions">
      <button id="startBtn">公式サイトで入力開始</button>
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
      <input type="checkbox" id="c${i}" checked data-index="${i}">
      <label for="c${i}" class="combo-numbers">${nums}</label>
      <span class="kuchi-badge">${combo.kuchiCount}口</span>
      <span class="set-label">S${combo.setNumber}</span>
    `;
    comboList.appendChild(div);
  });

  let allChecked = true;
  document.getElementById('selectAll').addEventListener('click', () => {
    allChecked = !allChecked;
    document.querySelectorAll('#comboList input[type="checkbox"]').forEach(
      cb => (cb.checked = allChecked)
    );
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
    const confirmed = await showConfirmDialog(drawRound, selected.length);
    if (!confirmed) return;

    await chrome.storage.local.set({
      selectloto_autofill: {
        lotteryType: lotteryType ?? 'loto6',
        drawRound,
        combinations: selected,
        timestamp: Date.now(),
      },
    });

    statusEl.className = 'status ok';
    statusEl.innerHTML = `✅ ${selected.length}組を保存しました`;
    document.getElementById('startBtn').disabled = true;

    // 公式サイトで購入するボタンを表示
    showOfficialSiteButton(lotteryType ?? 'loto6');
  });
});

// 公式サイトボタンを表示
function showOfficialSiteButton(lotteryType) {
  const actionsDiv = document.querySelector('.actions');

  const officialBtn = document.createElement('button');
  officialBtn.id = 'officialSiteBtn';
  officialBtn.textContent = '公式サイトで購入する';
  officialBtn.addEventListener('click', () => {
    const urls = {
      loto6: 'https://www.takarakuji-official.jp/st/common/loto6Net.html',
      loto7: 'https://www.takarakuji-official.jp/st/common/loto7Net.html',
      miniloto: 'https://www.takarakuji-official.jp/st/common/minilotoNet.html'
    };
    chrome.tabs.create({ url: urls[lotteryType] || urls.loto6 });
  });
  actionsDiv.appendChild(officialBtn);

  // 注記メッセージを追加
  const warningDiv = document.createElement('div');
  warningDiv.className = 'warning-note';
  warningDiv.innerHTML = `
    <strong>⚠️ ご注意：</strong><br>
    公式サイトを既に開いている場合は、サイト内の「ホーム」を押してからご利用ください。
  `;
  actionsDiv.appendChild(warningDiv);
}

// 抽せん回確認ダイアログ
function showConfirmDialog(drawRound, count) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-box">
        <div class="confirm-title">⚠️ 抽せん回の確認</div>
        <div class="confirm-round">第 ${drawRound} 回</div>
        <div class="confirm-count">${count}組を公式サイトへ入力します</div>
        <div class="confirm-note">
          <strong>確認事項：</strong><br>
          公式サイトの購入対象回が<br>
          <strong>第 ${drawRound} 回</strong> であることを確認してください。<br><br>
          <strong>⚠️ 通信エラーの注意：</strong><br>
          入力完了後、申込数字・購入口数・購入金額を<br>
          必ずご確認ください。
        </div>
        <div class="confirm-buttons">
          <button class="btn-cancel" id="confirmCancel">キャンセル</button>
          <button class="btn-confirm" id="confirmOk">確認して開始</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('confirmOk').addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });
    document.getElementById('confirmCancel').addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });
  });
}
