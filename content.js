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

let settings = { ...DEFAULT_SETTINGS };
let chatObserver = null;
let waitingObserver = null;
let startupIgnoreUntil = 0;
let lastAlertAt = 0;
let pendingAlertTimer = null;
const MESSAGE_SELECTOR = 'div[data-a-target="chat-line-message"], .chat-line__message, [data-test-selector="chat-line-message"]';
const MESSAGE_PREFIX = 'twitchChatAlertMarked';

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

function getStoredSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(DEFAULT_SETTINGS, (items) => {
      const mergedItems = { ...DEFAULT_SETTINGS, ...items };
      mergedItems.sounds = Array.isArray(items.sounds) && items.sounds.length ? items.sounds : DEFAULT_SOUNDS;
      mergedItems.channelSettings = normalizeChannelSettingsMap(items.channelSettings || {});
      resolve(mergedItems);
    });
  });
}

function getCurrentChannelName() {
  const segments = window.location.pathname.split('/').filter(Boolean);
  const candidate = segments.find((segment) => !['chat', 'videos', 'directory', 'popout', 'moderator', 'dashboard', 'settings', 'search'].includes(segment.toLowerCase()));
  return normalizeChannelName(candidate || segments[0] || '');
}

function getRootCandidates() {
  return [
    document.querySelector('#chat-scrollable-area'),
    document.querySelector('.chat-scrollable-area__message-container'),
    document.querySelector('.chat-scrollable-area'),
    document.querySelector('[data-a-target="chat-scrollable-area__message-container"]')
  ].filter(Boolean);
}

function clearPendingAlert() {
  if (pendingAlertTimer) {
    clearTimeout(pendingAlertTimer);
    pendingAlertTimer = null;
  }
}

function isChannelEnabled() {
  const channel = getCurrentChannelName();
  if (!channel) {
    return settings.enabled;
  }

  const channelState = settings.channelSettings && settings.channelSettings[channel];
  if (channelState !== undefined) {
    return Boolean(channelState.enabled);
  }

  const matchingLegacyChannel = Object.entries(settings.channelSettings || {}).find(([key]) => normalizeChannelName(key) === channel);
  if (matchingLegacyChannel) {
    return Boolean(matchingLegacyChannel[1].enabled);
  }

  return false;
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

function updateExtensionBadge() {
  let color = '#6b7280';

  if (!settings.enabled) {
    color = '#6b7280';
  } else if (isChannelEnabled()) {
    color = '#22c55e';
  } else if (getCurrentChannelName()) {
    color = '#ef4444';
  } else {
    color = '#6b7280';
  }

  setStatusIcon(color);
}

function getSelectedSound() {
  const list = Array.isArray(settings.sounds) && settings.sounds.length ? settings.sounds : DEFAULT_SOUNDS;
  return list.find((sound) => sound.id === settings.selectedSoundId) || list[0];
}

function playAudioFromUrl(url) {
  const audio = new Audio(url);
  audio.volume = settings.volume;
  audio.play().catch(() => {});
}

function playToneSound(sound) {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) {
    return;
  }

  const audioContext = new AudioCtor();
  const gainNode = audioContext.createGain();
  const now = audioContext.currentTime;

  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(settings.volume, now + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + (sound.duration || 0.3));

  const sequence = Array.isArray(sound.sequence) && sound.sequence.length ? sound.sequence : [{ frequency: sound.frequency || 880, duration: sound.duration || 0.3, waveform: sound.waveform || 'sine' }];

  sequence.forEach((entry, index) => {
    const oscillator = audioContext.createOscillator();
    oscillator.type = entry.waveform || sound.waveform || 'sine';
    oscillator.frequency.setValueAtTime(entry.frequency || sound.frequency || 880, now + index * 0.05);
    oscillator.connect(gainNode);
    oscillator.start(now + index * 0.05);
    oscillator.stop(now + index * 0.05 + (entry.duration || sound.duration || 0.3));
  });

  gainNode.connect(audioContext.destination);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
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

function getAuthorName(element) {
  const authorNode = element.querySelector('[data-a-target="chat-message-username"], .chat-author__display-name, .chat-line__username, .username');
  if (authorNode) {
    return normalizeName(authorNode.textContent || authorNode.getAttribute('data-username') || authorNode.getAttribute('aria-label'));
  }

  const text = element.textContent || '';
  const match = text.match(/^\s*([^\s:]+)\s*[:\-]/);
  return match ? normalizeName(match[1]) : '';
}

function isIgnoredUser(element) {
  const author = getAuthorName(element);
  if (!author) {
    return false;
  }

  const ignoredUsers = Array.isArray(settings.ignoredUsers)
    ? settings.ignoredUsers.map((value) => normalizeName(value)).filter(Boolean)
    : [];

  return ignoredUsers.includes(author);
}

function isMentionedMessage(element) {
  const username = normalizeName(settings.myUsername);
  if (!username) {
    return true;
  }

  const text = (element.textContent || '').toLowerCase();
  const pattern = new RegExp(`(^|[^a-z0-9_])@?${escapeRegExp(username)}(?![a-z0-9_])`, 'i');
  return pattern.test(text);
}

function isOwnMessage(element) {
  const username = normalizeName(settings.myUsername);
  if (!username) {
    return false;
  }

  const author = getAuthorName(element);
  return author && author === username;
}

function playSelectedSound() {
  const channel = getCurrentChannelName();
  if (!settings.enabled || !isChannelEnabled()) {
    return;
  }

  const now = Date.now();
  if (now - lastAlertAt < (settings.alertCooldownMs || 0)) {
    return;
  }

  lastAlertAt = now;

  const sound = getSelectedSound();
  if (!sound) {
    return;
  }

  if (sound.type === 'url' && sound.url) {
    playAudioFromUrl(sound.url);
    return;
  }

  playToneSound(sound);
}

function queueAlert() {
  const channel = getCurrentChannelName();
  if (!settings.enabled || !isChannelEnabled()) {
    clearPendingAlert();
    return;
  }

  const roots = getRootCandidates();
  const hasChatMessages = roots.some((root) => root.querySelector(MESSAGE_SELECTOR));
  if (!hasChatMessages) {
    clearPendingAlert();
    return;
  }

  clearPendingAlert();

  pendingAlertTimer = setTimeout(() => {
    pendingAlertTimer = null;

    if (!settings.enabled || !isChannelEnabled()) {
      return;
    }

    const freshRoots = getRootCandidates();
    const stillHasMessages = freshRoots.some((root) => root.querySelector(MESSAGE_SELECTOR));
    if (!stillHasMessages) {
      return;
    }

    if (Date.now() - lastAlertAt >= (settings.alertCooldownMs || 0)) {
      playSelectedSound();
    }
  }, settings.alertDebounceMs || 1200);
}

function markMessageAsHandled(element) {
  element.dataset[MESSAGE_PREFIX] = 'true';
}

function isHandled(element) {
  return element.dataset && element.dataset[MESSAGE_PREFIX] === 'true';
}

function handleMessageElement(element, shouldPlaySound = true) {
  if (!element || isHandled(element)) {
    return;
  }

  markMessageAsHandled(element);

  if (Date.now() < startupIgnoreUntil) {
    return;
  }

  if (!shouldPlaySound || !settings.enabled || !isChannelEnabled()) {
    return;
  }

  if (settings.ignoreOwnMessages && isOwnMessage(element)) {
    return;
  }

  if (isIgnoredUser(element)) {
    return;
  }

  if (settings.mentionOnly && !isMentionedMessage(element)) {
    return;
  }

  queueAlert();
}

function scanForMessages(root, shouldPlaySound = true) {
  const collected = root.querySelectorAll(MESSAGE_SELECTOR);
  collected.forEach((element) => handleMessageElement(element, shouldPlaySound));
}

function processMutations(mutations) {
  for (const mutation of mutations) {
    if (mutation.type !== 'childList') {
      continue;
    }

    mutation.addedNodes.forEach((node) => {
      if (!(node instanceof Element)) {
        return;
      }

      if (node.matches(MESSAGE_SELECTOR)) {
        handleMessageElement(node);
      }

      scanForMessages(node, true);
    });
  }
}

function setupObserver() {
  const rootCandidates = getRootCandidates();

  if (rootCandidates.length === 0) {
    clearPendingAlert();
    if (waitingObserver) {
      return;
    }

    waitingObserver = new MutationObserver(() => {
      const pendingRoots = [
        document.querySelector('#chat-scrollable-area'),
        document.querySelector('.chat-scrollable-area__message-container'),
        document.querySelector('.chat-scrollable-area'),
        document.querySelector('[data-a-target="chat-scrollable-area__message-container"]')
      ].filter(Boolean);

      if (pendingRoots.length > 0) {
        waitingObserver.disconnect();
        waitingObserver = null;
        setupObserver();
      }
    });

    waitingObserver.observe(document.body, { childList: true, subtree: true });
    return;
  }

  if (chatObserver) {
    chatObserver.disconnect();
  }

  chatObserver = new MutationObserver(processMutations);

  rootCandidates.forEach((root) => {
    chatObserver.observe(root, { childList: true, subtree: true });
  });

  rootCandidates.forEach((root) => scanForMessages(root, false));
}

async function start() {
  settings = await getStoredSettings();
  startupIgnoreUntil = Date.now() + 6000;

  chrome.storage.onChanged.addListener((changes) => {
    clearPendingAlert();

    if (changes.enabled) {
      settings.enabled = changes.enabled.newValue;
    }

    if (changes.volume) {
      settings.volume = changes.volume.newValue;
    }

    if (changes.selectedSoundId) {
      settings.selectedSoundId = changes.selectedSoundId.newValue;
    }

    if (changes.sounds) {
      settings.sounds = changes.sounds.newValue || DEFAULT_SOUNDS;
    }

    if (changes.channelSettings) {
      settings.channelSettings = normalizeChannelSettingsMap(changes.channelSettings.newValue || {});
    }

    if (changes.ignoreOwnMessages) {
      settings.ignoreOwnMessages = changes.ignoreOwnMessages.newValue;
    }

    if (changes.mentionOnly) {
      settings.mentionOnly = changes.mentionOnly.newValue;
    }

    if (changes.myUsername) {
      settings.myUsername = changes.myUsername.newValue || '';
    }

    if (changes.ignoredUsers) {
      settings.ignoredUsers = Array.isArray(changes.ignoredUsers.newValue) ? changes.ignoredUsers.newValue : [];
    }

    if (changes.alertCooldownMs) {
      settings.alertCooldownMs = Number(changes.alertCooldownMs.newValue || 0);
    }

    if (changes.alertDebounceMs) {
      settings.alertDebounceMs = Number(changes.alertDebounceMs.newValue || 1200);
    }

    updateExtensionBadge();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'setSettings') {
      clearPendingAlert();

      settings = { ...settings, ...message.settings };
      settings.sounds = Array.isArray(message.settings.sounds) && message.settings.sounds.length ? message.settings.sounds : DEFAULT_SOUNDS;
      settings.channelSettings = normalizeChannelSettingsMap(message.settings.channelSettings || {});
      settings.ignoreOwnMessages = Boolean(message.settings.ignoreOwnMessages);
      settings.mentionOnly = Boolean(message.settings.mentionOnly);
      settings.myUsername = String(message.settings.myUsername || '');
      settings.ignoredUsers = Array.isArray(message.settings.ignoredUsers) ? message.settings.ignoredUsers : DEFAULT_SETTINGS.ignoredUsers;
      settings.alertCooldownMs = Number(message.settings.alertCooldownMs || settings.alertCooldownMs || 0);
      settings.alertDebounceMs = Number(message.settings.alertDebounceMs || settings.alertDebounceMs || 1200);
      updateExtensionBadge();
      sendResponse({ ok: true });
    }
  });

  updateExtensionBadge();
  setupObserver();
}

start();
