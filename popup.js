const enabledToggle = document.getElementById('enabledToggle');
const volumeSlider = document.getElementById('volumeSlider');
const testButton = document.getElementById('testButton');
const soundSelect = document.getElementById('soundSelect');
const customSoundName = document.getElementById('customSoundName');
const customSoundUrl = document.getElementById('customSoundUrl');
const addSoundButton = document.getElementById('addSoundButton');
const channelNameInput = document.getElementById('channelNameInput');
const channelToggle = document.getElementById('channelToggle');
const currentChannelText = document.getElementById('currentChannelText');
const ignoreOwnMessagesToggle = document.getElementById('ignoreOwnMessagesToggle');
const mentionOnlyToggle = document.getElementById('mentionOnlyToggle');
const myUsernameInput = document.getElementById('myUsernameInput');
const alertCooldownSlider = document.getElementById('alertCooldownSlider');
const alertCooldownValue = document.getElementById('alertCooldownValue');
const alertDebounceSlider = document.getElementById('alertDebounceSlider');
const alertDebounceValue = document.getElementById('alertDebounceValue');
const ignoredUsersInput = document.getElementById('ignoredUsersInput');

function normalizeChannelSettingsMap(map) {
  if (!map || typeof map !== 'object') {
    return {};
  }

  const normalized = {};
  Object.entries(map).forEach(([key, value]) => {
    const normalizedKey = normalizeChannelName(key);
    if (!normalizedKey) {
      return;
    }

    normalized[normalizedKey] = value && typeof value === 'object' ? { ...value } : { enabled: Boolean(value) };
  });

  return normalized;
}

async function getStorageSettings() {
  const result = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const settings = { ...DEFAULT_SETTINGS, ...result };
  settings.sounds = Array.isArray(result.sounds) && result.sounds.length ? result.sounds : DEFAULT_SOUNDS;
  settings.channelSettings = normalizeChannelSettingsMap(result.channelSettings || {});
  return settings;
}

async function renderSoundOptions() {
  const settings = await getStorageSettings();
  soundSelect.innerHTML = '';

  settings.sounds.forEach((sound) => {
    const option = document.createElement('option');
    option.value = sound.id;
    option.textContent = sound.name;
    soundSelect.appendChild(option);
  });

  soundSelect.value = settings.selectedSoundId || settings.sounds[0]?.id || '';
}

async function getCurrentTwitchChannel() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const [tab] = tabs;

  if (!tab?.url) {
    return '';
  }

  try {
    const url = new URL(tab.url);
    if (!url.hostname.endsWith('.twitch.tv') && url.hostname !== 'twitch.tv') {
      return '';
    }

    const segments = url.pathname.split('/').filter(Boolean);
    const candidate = segments.find((segment) => !['chat', 'videos', 'directory', 'popout', 'moderator', 'dashboard', 'settings', 'search'].includes(segment.toLowerCase()));
    return normalizeChannelName(url.pathname);
  } catch {
    return '';
  }
}

async function isCurrentTabOnTwitch() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const [tab] = tabs;

  if (!tab?.url) {
    return false;
  }

  try {
    const url = new URL(tab.url);
    return url.hostname.endsWith('.twitch.tv') || url.hostname === 'twitch.tv';
  } catch {
    return false;
  }
}

async function syncChannelFields() {
  const settings = await getStorageSettings();
  const currentChannel = await getCurrentTwitchChannel();

  const requestedChannel = normalizeChannelName(channelNameInput.value) || currentChannel;
  if (requestedChannel) {
    channelNameInput.value = requestedChannel;
    currentChannelText.textContent = `Configurando: ${requestedChannel}`;
  } else {
    channelNameInput.value = '';
    currentChannelText.textContent = 'Abra uma stream da Twitch para usar o canal atual';
  }

  const channel = normalizeChannelName(channelNameInput.value || currentChannel || '');
  const isOnTwitch = Boolean(channel);
  channelToggle.disabled = !isOnTwitch;
  channelToggle.checked = Boolean(isOnTwitch && settings.channelSettings?.[channel]?.enabled === true);
}

async function setStatusIcon(color) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) await chrome.runtime.sendMessage({ type: 'status', color, tabId: tab.id });
}

function updateExtensionBadgeForCurrentTab(state) {
  const badgeMap = {
    gray: '#6b7280',
    green: '#22c55e',
    red: '#ef4444'
  };

  const resolvedState = badgeMap[state] || badgeMap.gray;
  setStatusIcon(resolvedState);
}

async function saveSettings({ updateChannel = false } = {}) {
  if (!(await isCurrentTabOnTwitch())) return;

  const settings = await getStorageSettings();
  const nextSettings = {
    ...settings,
    enabled: enabledToggle.checked,
    volume: Number(volumeSlider.value),
    selectedSoundId: soundSelect.value,
    sounds: settings.sounds,
    channelSettings: settings.channelSettings || {},
    ignoreOwnMessages: ignoreOwnMessagesToggle.checked,
    mentionOnly: mentionOnlyToggle.checked,
    myUsername: myUsernameInput.value.trim(),
    ignoredUsers: String(ignoredUsersInput.value || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    alertCooldownMs: Number(alertCooldownSlider.value),
    alertDebounceMs: Number(alertDebounceSlider.value)
  };

  if (updateChannel) {
    const channel = normalizeChannelName(channelNameInput.value || '');
    if (channel) {
      nextSettings.channelSettings = normalizeChannelSettingsMap({
        ...nextSettings.channelSettings,
        [channel]: { enabled: channelToggle.checked }
      });
    }
  }

  nextSettings.channelSettings = normalizeChannelSettingsMap(nextSettings.channelSettings || {});
  await chrome.storage.local.set(nextSettings);

  const channelName = normalizeChannelName(channelNameInput.value || (await getCurrentTwitchChannel()) || '');
  const isGloballyEnabled = nextSettings.enabled;
  const currentChannelState = channelName ? nextSettings.channelSettings?.[channelName] : undefined;
  const isChannelEnabledForCurrentTab = channelName
    ? Boolean(currentChannelState?.enabled === true)
    : isGloballyEnabled;

  if (!isGloballyEnabled) {
    updateExtensionBadgeForCurrentTab('gray');
  } else if (channelName && !isChannelEnabledForCurrentTab) {
    updateExtensionBadgeForCurrentTab('red');
  } else {
    updateExtensionBadgeForCurrentTab('green');
  }

}

async function playTestSound() {
  if (!(await isCurrentTabOnTwitch())) return;
  const resolvedSettings = await getStorageSettings();
  const selectedSound = (resolvedSettings.sounds || []).find((sound) => sound.id === soundSelect.value)
    || resolvedSettings.sounds[0]
    || DEFAULT_SOUNDS[0];

  try {
    await playAlertSound(selectedSound, Number(volumeSlider.value));
    showFeedback('Som reproduzido.');
  } catch { showFeedback('Não foi possível tocar. Confira a URL e a permissão de áudio.', true); }
}

function showFeedback(message, error = false) {
  const feedback = document.getElementById('feedback');
  feedback.textContent = message;
  feedback.classList.toggle('error', error);
}

async function addCustomSound() {
  if (!(await isCurrentTabOnTwitch())) return;
  const settings = await getStorageSettings();
  const name = customSoundName.value.trim();
  const url = customSoundUrl.value.trim();

  if (!name || !url) { showFeedback('Preencha o nome e a URL do som.', true); return; }
  try {
    if (new URL(url).protocol !== 'https:') throw new Error();
  } catch { showFeedback('Use uma URL de áudio válida com HTTPS.', true); return; }

  const sounds = Array.isArray(settings.sounds) ? [...settings.sounds] : [...DEFAULT_SOUNDS];
  const customSound = {
    id: `custom-${Date.now()}`,
    name,
    type: 'url',
    url
  };

  sounds.push(customSound);

  const nextSettings = {
    ...settings,
    sounds,
    selectedSoundId: customSound.id
  };

  await chrome.storage.local.set(nextSettings);
  await renderSoundOptions();
  soundSelect.value = customSound.id;
  customSoundName.value = '';
  customSoundUrl.value = '';
  await saveSettings();
}

document.addEventListener('DOMContentLoaded', async () => {
  const settings = await getStorageSettings();
  const canUseExtension = await isCurrentTabOnTwitch();
  const siteGuardMessage = document.getElementById('siteGuardMessage');

  const enablePopupControls = () => {
    [enabledToggle, volumeSlider, testButton, soundSelect, customSoundName, customSoundUrl, addSoundButton,
      channelNameInput, channelToggle, ignoreOwnMessagesToggle, mentionOnlyToggle, myUsernameInput,
      alertCooldownSlider, alertDebounceSlider, ignoredUsersInput].forEach((element) => {
      if (element) {
        element.disabled = false;
      }
    });

    if (siteGuardMessage) {
      siteGuardMessage.classList.add('hidden');
    }
  };

  if (!canUseExtension) {
    document.querySelectorAll('input, select, button').forEach(element => {
      element.disabled = true;
    });
    siteGuardMessage.classList.remove('hidden');
  } else {
    enablePopupControls();
  }

  enabledToggle.checked = settings.enabled;
  volumeSlider.value = String(settings.volume);
  document.getElementById('volumeValue').textContent = `${Math.round(settings.volume * 100)}%`;
  alertCooldownSlider.value = String(settings.alertCooldownMs ?? 2000);
  alertCooldownValue.textContent = `${Number(alertCooldownSlider.value) / 1000}s`;
  alertDebounceSlider.value = String(settings.alertDebounceMs ?? 1400);
  alertDebounceValue.textContent = `${Number(alertDebounceSlider.value) / 1000}s`;
  ignoredUsersInput.value = Array.isArray(settings.ignoredUsers) ? settings.ignoredUsers.join(', ') : '';
  ignoreOwnMessagesToggle.checked = settings.ignoreOwnMessages !== false;
  mentionOnlyToggle.checked = Boolean(settings.mentionOnly);
  myUsernameInput.value = settings.myUsername || '';
  await renderSoundOptions();
  soundSelect.value = settings.selectedSoundId || settings.sounds[0]?.id || '';
  await syncChannelFields();
  if (!canUseExtension) enabledToggle.checked = false;

  if (!canUseExtension) {
    updateExtensionBadgeForCurrentTab('gray');
  } else {
    const activeChannel = normalizeChannelName(channelNameInput.value || (await getCurrentTwitchChannel()) || '');
    const channelState = activeChannel ? settings.channelSettings?.[activeChannel] : undefined;

    if (!settings.enabled) {
      updateExtensionBadgeForCurrentTab('gray');
    } else if (activeChannel && channelState?.enabled !== true) {
      updateExtensionBadgeForCurrentTab('red');
    } else {
      updateExtensionBadgeForCurrentTab('green');
    }
  }

  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const targetTab = button.dataset.tab;

      tabButtons.forEach((item) => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', String(active));
      });

      tabContents.forEach((content) => {
        const active = content.dataset.content === targetTab;
        content.classList.toggle('active', active);
      });
    });
  });

  enabledToggle.addEventListener('change', () => saveSettings());
  volumeSlider.addEventListener('input', () => {
    document.getElementById('volumeValue').textContent = `${Math.round(Number(volumeSlider.value) * 100)}%`;
    saveSettings();
  });
  alertCooldownSlider.addEventListener('input', () => {
    alertCooldownValue.textContent = `${Number(alertCooldownSlider.value) / 1000}s`;
    saveSettings();
  });
  alertDebounceSlider.addEventListener('input', () => {
    alertDebounceValue.textContent = `${Number(alertDebounceSlider.value) / 1000}s`;
    saveSettings();
  });
  soundSelect.addEventListener('change', () => saveSettings());
  ignoreOwnMessagesToggle.addEventListener('change', () => saveSettings());
  mentionOnlyToggle.addEventListener('change', () => saveSettings());
  myUsernameInput.addEventListener('change', () => saveSettings());
  ignoredUsersInput.addEventListener('change', () => saveSettings());
  testButton.addEventListener('click', playTestSound);
  addSoundButton.addEventListener('click', addCustomSound);
  channelToggle.addEventListener('change', async () => {
    await saveSettings({ updateChannel: true });
  });
  channelNameInput.addEventListener('change', async () => {
    await syncChannelFields();
  });
});
