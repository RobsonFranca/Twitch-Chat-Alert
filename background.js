function setTabStatus(tabId, state) {
  const path = Object.fromEntries([16, 32, 48, 128].map(size => [size, `icons/icon-${state}-${size}.png`]));
  chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
  chrome.action.setIcon({ tabId, path }).catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type !== 'status') return;
  const tabId = sender.tab?.id ?? message.tabId;
  if (!Number.isInteger(tabId)) return;
  const state = { '#6b7280': 'gray', '#22c55e': 'green', '#ef4444': 'red' }[message.color] || 'gray';
  setTabStatus(tabId, state);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') setTabStatus(tabId, 'gray');
});
