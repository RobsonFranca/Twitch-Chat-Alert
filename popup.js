const DEFAULT_SOUNDS = [
  { id: 'tone-1', name: 'Tom 1', type: 'tone', waveform: 'sine', frequency: 880, duration: 0.28 },
  { id: 'tone-2', name: 'Tom 2', type: 'tone', waveform: 'triangle', frequency: 660, duration: 0.34 },
  { id: 'tone-3', name: 'Chime', type: 'tone', waveform: 'square', frequency: 1046.5, duration: 0.22, sequence: [
    { frequency: 1046.5, duration: 0.18 },
    { frequency: 1318.5, duration: 0.14 }
  ] },
  { id: 'tone-4', name: 'Bass', type: 'tone', waveform: 'sawtooth', frequency: 220, duration: 0.42 }
];

const DEFAULT_SETTINGS = {
  enabled: true,
  volume: 0.7,
  selectedSoundId: 'tone-1',
  sounds: DEFAULT_SOUNDS,
  channelSettings: {},
  ignoreOwnMessages: true,
  mentionOnly: false,
  myUsername: '',
  ignoredUsers: ['streamelements', 'streamlabs', 'nightbot', 'moobot'],
  alertCooldownMs: 2000,
  alertDebounceMs: 1400
};

const enabledToggle = document.getElementById('enabledToggle');
const volumeSlider = document.getElementById('volumeSlider');
const testButton = document.getElementById('testButton');
const soundSelect = document.getElementById('soundSelect');
const customSoundName = document.getElementById('customSoundName');
const customSoundUrl = document.getElementById('customSoundUrl');
const addSoundButton = document.getElementById('addSoundButton');
const channelNameInput = document.getElementById('channelNameInput');
const channelToggle = document.getElementById('channelToggle');
const channelToggleLabel = document.getElementById('channelToggleLabel');
const currentChannelText = document.getElementById('currentChannelText');
const channelStatusBadge = document.getElementById('channelStatusBadge');
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

function normalizeChannelName(value) {
  let raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  try {
    const url = new URL(raw);
    raw = url.pathname;
  } catch {
    // keeps raw value when it is not a full URL
  }

  raw = raw.toLowerCase().replace(/^@/, '');
  const segments = raw.split('/').filter(Boolean);
  const candidate = segments.find((segment) => !['chat', 'videos', 'directory', 'popout', 'moderator', 'dashboard', 'settings', 'search'].includes(segment.toLowerCase()));
  const cleaned = (candidate || segments[0] || raw).replace(/^@/, '').trim();
  return cleaned.toLowerCase();
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
    return normalizeChannelName(candidate || segments[0] || '');
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

function updateChannelStatus() {
  const isEnabled = channelToggle.checked;
  channelToggleLabel.textContent = isEnabled ? 'Canal ativado' : 'Ativar canal';
  channelStatusBadge.textContent = isEnabled ? 'Ligado' : 'Desligado';
  channelStatusBadge.classList.toggle('status-on', isEnabled);
  channelStatusBadge.classList.toggle('status-off', !isEnabled);
}

async function syncChannelFields() {
  const settings = await getStorageSettings();
  const currentChannel = await getCurrentTwitchChannel();

  if (currentChannel) {
    channelNameInput.value = currentChannel;
    currentChannelText.textContent = `Canal atual: ${currentChannel}`;
  } else {
    channelNameInput.value = '';
    currentChannelText.textContent = 'Abra uma stream da Twitch para usar o canal atual';
  }

  const channel = normalizeChannelName(channelNameInput.value || currentChannel || '');
  const isOnTwitch = Boolean(channel);
  channelToggle.disabled = !isOnTwitch;
  channelToggle.checked = Boolean(isOnTwitch && settings.channelSettings?.[channel]?.enabled === true);
  updateChannelStatus();
}

function setStatusIcon(color) {
  if (!chrome?.action) {
    return;
  }

  try {
    const sizes = [16, 32, 48, 128];
    const imageData = {};

    sizes.forEach((size) => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      ctx.clearRect(0, 0, size, size);

      ctx.fillStyle = '#1f2937';
      ctx.fillRect(0, 0, size, size);

      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${size * 0.72}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('T', size / 2, size / 2 + 1);

      const dotRadius = Math.max(3, size * 0.18);
      const dotX = size - dotRadius - Math.max(1, size * 0.12);
      const dotY = size - dotRadius - Math.max(1, size * 0.12);

      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
      ctx.fill();

      imageData[size] = ctx.getImageData(0, 0, size, size);
    });

    chrome.action.setIcon({ imageData });
  } catch (error) {
    // Ignore badge update failures silently.
  }
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
  if (!(await isCurrentTabOnTwitch())) {
    return;
  }

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

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'setSettings',
        settings: nextSettings
      });
    }
  });
}

async function playTestSound() {
  const resolvedSettings = await getStorageSettings();
  const selectedSound = (resolvedSettings.sounds || []).find((sound) => sound.id === soundSelect.value)
    || resolvedSettings.sounds[0]
    || DEFAULT_SOUNDS[0];

  if (selectedSound.type === 'url' && selectedSound.url) {
    const audio = new Audio(selectedSound.url);
    audio.volume = Number(volumeSlider.value);
    audio.play().catch(() => {});
    return;
  }

  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) {
    return;
  }

  const context = new AudioCtor();
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const now = context.currentTime;

  oscillator.type = selectedSound.waveform || 'sine';
  oscillator.frequency.setValueAtTime(selectedSound.frequency || 880, now);
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(Number(volumeSlider.value), now + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + (selectedSound.duration || 0.3));

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + (selectedSound.duration || 0.3));
}

async function addCustomSound() {
  const settings = await getStorageSettings();
  const name = customSoundName.value.trim();
  const url = customSoundUrl.value.trim();

  if (!name || !url) {
    return;
  }

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

  const disablePopupControls = () => {
    [enabledToggle, volumeSlider, testButton, soundSelect, customSoundName, customSoundUrl, addSoundButton,
      channelNameInput, channelToggle, ignoreOwnMessagesToggle, mentionOnlyToggle, myUsernameInput,
      alertCooldownSlider, alertDebounceSlider, ignoredUsersInput].forEach((element) => {
      if (element) {
        element.disabled = true;
      }
    });

    updateExtensionBadgeForCurrentTab('gray');

    if (siteGuardMessage) {
      siteGuardMessage.classList.remove('hidden');
    }
  };

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
    disablePopupControls();
  } else {
    enablePopupControls();
  }

  enabledToggle.checked = settings.enabled;
  volumeSlider.value = String(settings.volume);
  alertCooldownSlider.value = String(settings.alertCooldownMs || 2000);
  alertCooldownValue.textContent = `${Number(alertCooldownSlider.value) / 1000}s`;
  alertDebounceSlider.value = String(settings.alertDebounceMs || 1400);
  alertDebounceValue.textContent = `${Number(alertDebounceSlider.value) / 1000}s`;
  ignoredUsersInput.value = Array.isArray(settings.ignoredUsers) ? settings.ignoredUsers.join(', ') : '';
  ignoreOwnMessagesToggle.checked = settings.ignoreOwnMessages !== false;
  mentionOnlyToggle.checked = Boolean(settings.mentionOnly);
  myUsernameInput.value = settings.myUsername || '';
  await renderSoundOptions();
  soundSelect.value = settings.selectedSoundId || settings.sounds[0]?.id || '';
  await syncChannelFields();

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
  volumeSlider.addEventListener('input', () => saveSettings());
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
    updateChannelStatus();
    await saveSettings({ updateChannel: true });
  });
  channelNameInput.addEventListener('change', async () => {
    await syncChannelFields();
    await saveSettings({ updateChannel: true });
  });
});
