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
