const PLANNER_PATH = 'planner.html';

async function openOrFocusPlanner(): Promise<void> {
  const plannerUrl = chrome.runtime.getURL(PLANNER_PATH);
  const existing = await chrome.tabs.query({ url: plannerUrl });
  if (existing.length > 0 && existing[0].id !== undefined) {
    await chrome.tabs.update(existing[0].id, { active: true });
    if (existing[0].windowId !== undefined) {
      await chrome.windows.update(existing[0].windowId, { focused: true });
    }
    return;
  }
  await chrome.tabs.create({ url: plannerUrl });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'OPEN_PLANNER') {
    openOrFocusPlanner()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  return false;
});
