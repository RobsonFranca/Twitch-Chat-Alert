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
const currentChannelText = document.getElementById('currentChannelText');
const ignoreOwnMessagesToggle = document.getElementById('ignoreOwnMessagesToggle');
const mentionOnlyToggle = document.getElementById('mentionOnlyToggle');
const myUsernameInput = document.getElementById('myUsernameInput');
const alertCooldownSlider = document.getElementById('alertCooldownSlider');
const alertCooldownValue = document.getElementById('alertCooldownValue');
const alertDebounceSlider = document.getElementById('alertDebounceSlider');
const alertDebounceValue = document.getElementById('alertDebounceValue');
const ignoredUsersInput = document.getElementById('ignoredUsersInput');

async function getStorageSettings() {
  const result = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const settings = { ...DEFAULT_SETTINGS, ...result };
  settings.sounds = Array.isArray(result.sounds) && result.sounds.length ? result.sounds : DEFAULT_SOUNDS;
  settings.channelSettings = result.channelSettings || {};
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
    const match = url.pathname.match(/^\/([^/?#]+)/);
    return match ? match[1].trim().toLowerCase() : '';
  } catch {
    return '';
  }
}

async function syncChannelFields() {
  const settings = await getStorageSettings();
  const currentChannel = await getCurrentTwitchChannel();

  if (currentChannel) {
    channelNameInput.value = currentChannel;
    currentChannelText.textContent = `Canal atual: ${currentChannel}`;
  } else {
    currentChannelText.textContent = 'Abra uma stream da Twitch para usar o canal atual';
  }

  const channel = (channelNameInput.value || currentChannel || '').trim().toLowerCase();
  channelToggle.disabled = !channel;
  channelToggle.checked = Boolean(channel && settings.channelSettings?.[channel]?.enabled);
}

async function saveSettings({ updateChannel = false } = {}) {
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
    const channel = (channelNameInput.value || '').trim().toLowerCase();
    if (channel) {
      nextSettings.channelSettings[channel] = { enabled: channelToggle.checked };
    }
  }

  await chrome.storage.local.set(nextSettings);

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
  channelToggle.addEventListener('change', () => saveSettings({ updateChannel: true }));
  channelNameInput.addEventListener('change', async () => {
    await syncChannelFields();
    await saveSettings({ updateChannel: true });
  });
});
