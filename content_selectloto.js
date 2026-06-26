// selectloto.jp ページから組み合わせデータを読み取り、popupへ返す
const NUMBER_COUNT = { loto6: 6, loto7: 7, miniloto: 5 };

function detectLotteryType() {
  const path = location.pathname + location.href;
  if (path.includes('loto7'))    return 'loto7';
  if (path.includes('miniloto')) return 'miniloto';
  return 'loto6';
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'GET_COMBINATIONS') return;

  // このフレームにテーブルがなければ応答しない（親フレームの誤応答を防ぐ）
  const table = document.getElementById('combinationTable');
  if (!table) return;

  // 抽選済みの回は自動入力不可
  if (table.dataset.undrawn === '0') {
    sendResponse({ error: 'drawn' });
    return true;
  }

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

  sendResponse({ lotteryType, drawRound, combinations });
  return true;
});

// =====================================================================
// Orion iOS など iframe への sendMessage が届かない環境向けフォールバック
// テーブルにデータが揃ったら chrome.storage.local へ自動保存する
// =====================================================================
(function autoStorePageData() {
  const table = document.getElementById('combinationTable');
  if (!table) return; // このフレームに combinationTable がなければ何もしない

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
