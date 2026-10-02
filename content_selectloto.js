// selectloto.jp ページから組み合わせデータを読み取り、popupへ返す
const NUMBER_COUNT = { loto6: 6, loto7: 7, miniloto: 5 };

function detectLotteryType() {
  const path = location.pathname + location.href;
  if (path.includes('loto7'))    return 'loto7';
  if (path.includes('miniloto')) return 'miniloto';
  return 'loto6';
}

function readCurrentCombinations() {

  // このフレームにテーブルがなければ応答しない（親フレームの誤応答を防ぐ）
  const table = document.getElementById('combinationTable');
  if (!table) return;

  // 抽選済みの回は自動入力不可
  if (table.dataset.undrawn === '0') {
    return { error: table.dataset.inputState === 'not_ready' ? 'not_ready' : 'drawn' };
  }

  if (table.dataset.deadline && Date.now() >= Number(table.dataset.deadline)) return {error:'not_ready'};
  const lotteryType = detectLotteryType();
  const expectedCount = NUMBER_COUNT[lotteryType];
  const drawRound = new URLSearchParams(location.search).get('draw_round') || '';
  const rows = document.querySelectorAll('#combinationTable tbody tr');

  const combinations = [];
  rows.forEach(tr => {
    const cells = tr.querySelectorAll('td');
    if (cells.length < 4) return;

    const numberSpans = cells[2].querySelectorAll('.circle-background');
    const numbers = [...numberSpans]
      .map(s => parseInt(s.textContent.trim(), 10))
      .filter(n => !isNaN(n));

    const kuchiCount = parseInt(cells[3].textContent.trim(), 10) || 1;
    const setNumber = cells[1].textContent.trim();

    if (numbers.length === expectedCount) {
      combinations.push({ setNumber, numbers, kuchiCount });
    }
  });

  if (table.dataset.inputState && !combinations.length) return {error:'not_ready'};
  return { lotteryType, drawRound, combinations };
}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'GET_COMBINATIONS') return;
  const data = readCurrentCombinations();
  if (!data) return;
  sendResponse(data);return true;
});


// =====================================================================
// Orion iOS など iframe への sendMessage が届かない環境向けフォールバック
// テーブルにデータが揃ったら chrome.storage.local へ自動保存する
// =====================================================================
(function autoStorePageData() {
  const table = document.getElementById('combinationTable');
  if (!table || table.dataset.inputState) return; // 選択入力ページは共有キャッシュを使わない

  function extractAndStore() {
    // 抽選済みは保存しない（dataset は fetch 完了後にセットされる）
    if (table.dataset.undrawn === '0') return true; // 監視終了

    const rows = document.querySelectorAll('#combinationTable tbody tr');
    if (rows.length === 0) return false; // まだデータなし

    const lotteryType = detectLotteryType();
    const expectedCount = NUMBER_COUNT[lotteryType];
    const drawRound = new URLSearchParams(location.search).get('draw_round') || '';

    const combinations = [];
    rows.forEach(tr => {
      const cells = tr.querySelectorAll('td');
      if (cells.length < 4) return;
      const numberSpans = cells[2].querySelectorAll('.circle-background');
      const numbers = [...numberSpans]
        .map(s => parseInt(s.textContent.trim(), 10))
        .filter(n => !isNaN(n));
      const kuchiCount = parseInt(cells[3].textContent.trim(), 10) || 1;
      const setNumber = cells[1].textContent.trim();
      if (numbers.length === expectedCount) {
        combinations.push({ setNumber, numbers, kuchiCount });
      }
    });

    if (combinations.length === 0) return false;

    chrome.storage.local.set({
      selectloto_current_combinations: {
        lotteryType,
        drawRound,
        combinations,
        timestamp: Date.now(),
      }
    });
    return true; // 保存完了 → 監視終了
  }

  // 既にデータがあればすぐ保存、なければ tbody を監視
  if (!extractAndStore()) {
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const obs = new MutationObserver(() => {
      if (extractAndStore()) obs.disconnect();
    });
    obs.observe(tbody, { childList: true });
    setTimeout(() => obs.disconnect(), 30000); // 最大30秒で監視終了
  }
})();

// =====================================================================
// ページ内「公式サイトへ」ボタン クリック検出
// window.postMessage に依存せず DOM イベントで直接処理（確実に動作）
// 現在の表をその場で読む（別タブの共有キャッシュを使わない）
// =====================================================================
document.addEventListener('click', async (e) => {
  const trigger = e.target.closest('#_blkConfirm');
  if (!trigger || trigger.disabled) return;

  const data = readCurrentCombinations();
  if (data?.error || !data?.combinations?.length) return;

  await chrome.storage.local.set({
    selectloto_autofill: {
      lotteryType: data.lotteryType,
      drawRound: data.drawRound,
      combinations: data.combinations,
      currentIndex: 0,
      timestamp: Date.now(),
    }
  });

  chrome.runtime.sendMessage({ type: 'OPEN_OFFICIAL_SITE', lotteryType: data.lotteryType });
}, true); // capture phase で動的生成要素も確実に検出

// 選択入力ページ専用。送信時に現在の表を読み、別タブのキャッシュを参照しない。
document.documentElement.dataset.selectlotoAutofillBridge = '1';
let selectedTransferBusy = false;
document.addEventListener('selectloto:autofill-selected', async () => {
  if (selectedTransferBusy) return;
  selectedTransferBusy = true;
  try {
    const table = document.getElementById('combinationTable');
    const ack = document.getElementById('ack');
    const data = readCurrentCombinations();
    if (!table?.dataset.inputState || !ack?.checked || !data || data.error || !data.combinations.length || data.combinations.length > 50) throw new Error('not_ready');
    const max = {loto6:43,loto7:37,miniloto:31}[data.lotteryType];
    if (!max || data.combinations.some(c => new Set(c.numbers).size !== NUMBER_COUNT[data.lotteryType] || c.numbers.some(n=>!Number.isInteger(n)||n<1||n>max) || !Number.isInteger(c.kuchiCount) || c.kuchiCount<1 || c.kuchiCount>10)) throw new Error('invalid');
    await chrome.storage.local.set({selectloto_autofill:{...data,currentIndex:0,timestamp:Date.now()}});
    await chrome.runtime.sendMessage({type:'OPEN_OFFICIAL_SITE',lotteryType:data.lotteryType});
    document.dispatchEvent(new CustomEvent('selectloto:autofill-result',{detail:'ok'}));
  } catch (_) {
    document.dispatchEvent(new CustomEvent('selectloto:autofill-result',{detail:'error'}));
  } finally {selectedTransferBusy = false;}
});
