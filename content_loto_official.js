const BATCH_SIZE = 25;
const AUTOFILL_KEY = 'selectloto_autofill';
let autofillCancelled = false;

const GLONAVI_FORM = {
  loto6:    'glonaviLoto6Form',
  loto7:    'glonaviLoto7Form',
  miniloto: 'glonaviMinilotoForm',
};
const LOTTERY_LABEL = {
  loto6:    'LOTO6',
  loto7:    'LOTO7',
  miniloto: 'ミニロト',
};

(async () => {
  const stored = await chrome.storage.local.get(AUTOFILL_KEY);
  const autofill = stored[AUTOFILL_KEY];
  if (!autofill?.combinations?.length) return;

  if (Date.now() - autofill.timestamp > 30 * 60 * 1000) {
    await chrome.storage.local.remove(AUTOFILL_KEY);
    return;
  }

  const lotteryType = autofill.lotteryType ?? 'loto6';
  const label = LOTTERY_LABEL[lotteryType] ?? 'LOTO';

  // ページ遷移直後に即座にUIを表示（検出前に表示することで消灯時間を最小化）
  const statusUI = createStatusUI(label);
  document.body.appendChild(statusUI);
  const ci = autofill.currentIndex ?? 0;
  const tot = autofill.combinations.length;
  setStatus(statusUI, ci > 0 ? `処理継続中… ${ci}/${tot}組完了` : '準備中…', 'active');

  // ① 確認ページ検出（「買い物を続ける」ボタンがある）
  const continueBtn = document.querySelector('[opename="買い物を続ける"]');
  if (continueBtn) {
    await handleConfirmationPage(autofill, continueBtn, statusUI, label);
    return;
  }

  // ② 入力ページ検出（ナビフォームはどのページにも存在するため先に確認）
  const isInputPage = await waitForElement('.m_lotteryNumInputNum_btn', 5000)
    .then(() => true).catch(() => false);

  if (isInputPage) {
    // バッチ2以降で前バッチのパネルが復元されている場合、最初のパネル以外がアクティブになる
    // → ナビフォームで新しい入力ページへ移動してリセット
    if ((autofill.currentIndex ?? 0) > 0) {
      const panels = [...document.querySelectorAll('.m_lotteryNumBodyItemWrap')];
      const activePanel = getActivePanel();
      const activeIndex = activePanel ? panels.indexOf(activePanel) : 0;
      if (activeIndex > 0) {
        const navForm = document.getElementById(GLONAVI_FORM[lotteryType]);
        if (navForm) {
          setStatus(statusUI, '入力ページをリセット中…', 'active');
          await delay(1000);
          navForm.submit();
          return;
        }
      }
    }
    await handleInputPage(autofill, statusUI);
    return;
  }

  // ③ ECトップページ検出（入力ボタンなし ＋ ナビフォームあり → 購入ページへ自動遷移）
  const navForm = document.getElementById(GLONAVI_FORM[lotteryType]);
  if (navForm) {
    await handleEcTopPage(autofill, navForm, statusUI, label);
    return;
  }

  showPendingNotice(autofill, statusUI, label);
})();

// ===== ページ処理 =====

async function handleInputPage(autofill, statusUI) {
  const currentIndex = autofill.currentIndex ?? 0;
  const total = autofill.combinations.length;

  const batch = autofill.combinations.slice(currentIndex, currentIndex + BATCH_SIZE);

  // 入力中は誤操作を防ぐオーバーレイを表示（停止ボタンは statusUI が上に来るので有効）
  const overlay = createOverlay();
  document.body.appendChild(overlay);

  try {
    await fillCombinations(batch, currentIndex, total, statusUI);

    if (autofillCancelled) return;

    const newIndex = currentIndex + batch.length;
    await chrome.storage.local.set({
      [AUTOFILL_KEY]: { ...autofill, currentIndex: newIndex, timestamp: Date.now() }
    });

    setStatus(statusUI, `${batch.length}組入力完了。カートに追加中…`, 'active');
    await delay(800);

    const cartBtn = findEnabledButton('カートに入れる');
    if (cartBtn) {
      await clickInMainWorld(cartBtn);
    } else {
      setStatus(statusUI, '⚠️ 「カートに入れる」が見つかりません。手動でクリックしてください。', 'error');
    }
  } catch (e) {
    if (!autofillCancelled) {
      setStatus(statusUI, `⚠️ エラー: ${e.message}`, 'error');
    }
  } finally {
    overlay.remove();
  }
}

async function handleConfirmationPage(autofill, continueBtn, statusUI, label = 'LOTO') {
  const currentIndex = autofill.currentIndex ?? 0;
  const total = autofill.combinations.length;

  if (currentIndex >= total) {
    setStatus(statusUI, `✅ 全${total}組の入力完了！\nお支払い内容のご確認へ進んでください。`, 'done');
    await chrome.storage.local.remove(AUTOFILL_KEY);
    const stopBtn = statusUI.querySelector('#loto6-stop-btn');
    if (stopBtn) {
      stopBtn.textContent = '閉じる';
      stopBtn.style.background = '#555';
      stopBtn.style.opacity = '1';
      stopBtn.style.cursor = 'pointer';
      stopBtn.onclick = () => statusUI.remove();
    }
    return;
  }

  // 25組×2回（50組）ごとに自動停止
  const batchesCompleted = Math.floor(currentIndex / 25);
  const isPaymentTiming = batchesCompleted > 0 && batchesCompleted % 2 === 0;

  if (isPaymentTiming) {
    setStatus(statusUI,
      `✅ ${currentIndex}組の入力が完了しました。\n\n` +
      `次のステップ：\n` +
      `1️⃣ 公式サイトで支払いを完了\n` +
      `2️⃣ 拡張を再実行\n\n` +
      `自動で次の${currentIndex + 50}組へ…`,
      'done'
    );

    // currentIndex を保存（次回再開時用）
    await chrome.storage.local.set({
      [AUTOFILL_KEY]: { ...autofill, timestamp: Date.now() }
    });

    // ここで一旦停止
    return;
  }

  // 50組未満 → 買い物を続ける
  const remaining = total - currentIndex;
  setStatus(statusUI, `入力済 ${currentIndex}/${total}組\n残り${remaining}組 → 「買い物を続ける」へ移動します`, 'active');
  await chrome.storage.local.set({
    [AUTOFILL_KEY]: { ...autofill, timestamp: Date.now() }
  });
  await delay(1500);
  await clickInMainWorld(continueBtn);
}

async function handleEcTopPage(autofill, loto6Form, statusUI, label = 'LOTO') {
  const remaining = autofill.combinations.length - (autofill.currentIndex ?? 0);
  setStatus(statusUI, `残り${remaining}組 → ${label}購入ページへ移動します`, 'active');

  await chrome.storage.local.set({
    [AUTOFILL_KEY]: { ...autofill, timestamp: Date.now() }
  });
  await delay(1200);
  loto6Form.submit();
}

function showPendingNotice(autofill, statusUI, label = 'LOTO') {
  const remaining = autofill.combinations.length - (autofill.currentIndex ?? 0);
  if (remaining <= 0) return;
  setStatus(statusUI, `残り${remaining}組があります。\n${label}購入ページを開くと\n自動で入力を再開します。`, 'active');
}

// ===== 組み合わせ入力 =====

async function fillCombinations(batch, startIndex, total, statusUI) {
  for (let i = 0; i < batch.length; i++) {
    if (autofillCancelled) return;

    const combo = batch[i];
    const globalIdx = startIndex + i + 1;
    setStatus(statusUI, `入力中 ${globalIdx}/${total}組\n[${combo.numbers.join(' ')}] ${combo.kuchiCount}口`, 'active');

    // アクティブパネルを待つ
    await waitFor(() => !!getActivePanel());
    let panel = getActivePanel();

    // リセット
    const resetBtn = panel.querySelector('.m_lotteryNumInputNum_btn2');
    if (resetBtn) { resetBtn.click(); await delay(400); }

    // 数字を1つずつクリック（毎回パネルを再確認）
    for (const num of combo.numbers) {
      // パネルが変更されていないか確認
      panel = getActivePanel();
      if (!panel) throw new Error('アクティブパネルが見つかりません');

      const buttons = panel.querySelectorAll('.m_lotteryNumInputNum_btn');
      let clicked = false;
      for (const btn of buttons) {
        if (btn.textContent.trim() === String(num)) {
          btn.click();
          clicked = true;
          break;
        }
      }
      if (!clicked) throw new Error(`数字 ${num} のボタンが見つかりません (パネル内に数字なし)`);
      await delay(200);
    }

    // 口数を設定
    const kuchiSelect = panel.querySelector('.m_lotteryNumInputForm_select select');
    if (kuchiSelect) {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      nativeSetter.call(kuchiSelect, String(Math.min(combo.kuchiCount, 10)));
      kuchiSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await delay(200);
    }

    // 「次の申込数字へ」を2秒以内に試みる（最終パネルは永続的に無効なので検出できる）
    const nextReady = await waitFor(() => isNextBtnReady(panel), 5000)
      .then(() => true).catch(() => false);

    if (nextReady) {
      panel.querySelector('.m_lotteryNumInputForm_btn').click();
      await delay(600);
    } else {
      // 「次へ」が2秒以内に有効にならない → 最終パネル：カートを待ってbreak
      await waitFor(() => !!findEnabledButton('カートに入れる'));
      break;
    }
  }
}

// ===== ユーティリティ =====

function isNextBtnReady(panel) {
  const btn = panel.querySelector('.m_lotteryNumInputForm_btn');
  return btn && !btn.disabled && !btn.classList.contains('is_disabled');
}

function findEnabledButton(text) {
  return [...document.querySelectorAll('button, a')].find(
    el => el.textContent.trim().includes(text) && !el.disabled
  ) || null;
}

function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(selector)) return resolve();
    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) { observer.disconnect(); resolve(); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); reject(new Error(`Timeout: ${selector}`)); }, timeout);
  });
}

function waitFor(condition, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (condition()) return resolve();
      if (Date.now() - start > timeout) return reject(new Error('Timeout'));
      setTimeout(check, 100);
    };
    check();
  });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

function getActivePanel() {
  return [...document.querySelectorAll('.m_lotteryNumBodyItemWrap')].find(
    el => el.style.display !== 'none'
  );
}

// ===== フローティングUI =====

function createStatusUI(label = 'LOTO6') {
  const div = document.createElement('div');
  div.id = 'loto6-autofill-status';
  Object.assign(div.style, {
    position: 'fixed', top: '16px', right: '16px', zIndex: '99999',
    background: '#fff', border: '2px solid #0b72d9', borderRadius: '10px',
    padding: '12px 16px', fontSize: '13px', fontFamily: 'sans-serif',
    boxShadow: '0 4px 16px rgba(0,0,0,0.2)', maxWidth: '260px',
    lineHeight: '1.6',
  });
  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;white-space:normal;">
      <span style="font-weight:bold;color:#0b72d9;">${label} 自動入力補助</span>
      <span id="loto6-stop-btn" style="display:inline-block;font-size:11px;padding:2px 8px;background:#c00;color:#fff;border-radius:4px;cursor:pointer;user-select:none;line-height:1.6;">停止</span>
    </div>
    <div id="loto6-status-msg" style="white-space:pre-wrap;">準備中…</div>
  `;

  // 停止ボタン：フラグを立ててstorageを消去し、自動入力を完全停止
  div.querySelector('#loto6-stop-btn').addEventListener('click', async () => {
    autofillCancelled = true;
    await chrome.storage.local.remove(AUTOFILL_KEY);
    setStatus(div, '⛔ 自動入力を停止しました', 'error');
    const btn = div.querySelector('#loto6-stop-btn');
    if (btn) { btn.style.opacity = '0.5'; btn.style.cursor = 'default'; btn.onclick = null; }
  });

  return div;
}

function setStatus(ui, msg, state) {
  const el = ui.querySelector('#loto6-status-msg');
  if (el) el.textContent = msg;
  ui.style.borderColor = { done: '#080', error: '#c00', active: '#0b72d9' }[state] || '#0b72d9';
}

function createOverlay() {
  const div = document.createElement('div');
  div.id = 'loto6-input-overlay';
  Object.assign(div.style, {
    position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
    zIndex: '99998', background: 'rgba(0,0,0,0.15)', cursor: 'not-allowed',
  });
  return div;
}

// ===== CSP回避クリック（javascript: URL ブロック対策）=====

async function clickInMainWorld(element) {
  const selector = buildSelector(element);
  if (!selector) { element.click(); return; }
  try {
    const res = await chrome.runtime.sendMessage({ type: 'clickInMainWorld', selector });
    if (!res?.ok) {
      console.warn('[loto6] MAIN-world click failed, fallback:', res);
      element.click();
    }
  } catch {
    element.click();
  }
}

function buildSelector(el) {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const opename = el.getAttribute('opename');
  if (opename) return `[opename="${CSS.escape(opename)}"]`;
  const marker = `loto6-t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  el.setAttribute('data-loto6-target', marker);
  return `[data-loto6-target="${marker}"]`;
}
