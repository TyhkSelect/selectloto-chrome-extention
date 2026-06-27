// MAIN world でクリックを実行するリクエストを content script から受け取る
// （サイトCSP の javascript: URL ブロックを background の executeScript で回避）
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // スマホ版ページボタン → 公式サイトを新タブで開く
  if (msg?.type === 'OPEN_OFFICIAL_SITE') {
    const urls = {
      loto6:    'https://www.takarakuji-official.jp/ec/loto6/',
      loto7:    'https://www.takarakuji-official.jp/ec/loto7/',
      miniloto: 'https://www.takarakuji-official.jp/ec/miniloto/',
    };
    const url = urls[msg.lotteryType] || urls.loto6;
    chrome.tabs.create({ url });
    sendResponse({ ok: true });
    return true;
  }

  if (msg?.type !== 'clickInMainWorld') return;

  const tabId = sender.tab?.id;
  if (!tabId) {
    sendResponse({ ok: false, error: 'no tabId' });
    return true;
  }

  const target = { tabId };
  if (sender.frameId !== undefined) target.frameIds = [sender.frameId];

  chrome.scripting.executeScript({
    target,
    world: 'MAIN',
    func: (selector) => {
      const el = document.querySelector(selector);
      if (!el) return { ok: false, error: 'element not found: ' + selector };
      el.click();
      return { ok: true };
    },
    args: [msg.selector],
  }).then(results => {
    sendResponse(results?.[0]?.result ?? { ok: false, error: 'no result' });
  }).catch(err => {
    sendResponse({ ok: false, error: String(err) });
  });

  return true; // 非同期レスポンス
});
