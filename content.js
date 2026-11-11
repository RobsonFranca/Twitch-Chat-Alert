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

function getStoredSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(DEFAULT_SETTINGS, (items) => {
      const mergedItems = { ...DEFAULT_SETTINGS, ...items };
      mergedItems.sounds = Array.isArray(items.sounds) && items.sounds.length ? items.sounds : DEFAULT_SOUNDS;
      mergedItems.channelSettings = items.channelSettings || {};
      resolve(mergedItems);
    });
  });
}

function getCurrentChannelName() {
  const match = window.location.pathname.match(/^\/([^/?#]+)/);
  return match ? match[1].trim().toLowerCase() : '';
}

function isChannelEnabled() {
  const channel = getCurrentChannelName();
  if (!channel) {
    return settings.enabled;
  }

  const channelState = settings.channelSettings && settings.channelSettings[channel];
  if (channelState === undefined) {
    return settings.enabled;
  }

  return Boolean(channelState.enabled);
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
  if (pendingAlertTimer) {
    clearTimeout(pendingAlertTimer);
  }

  pendingAlertTimer = setTimeout(() => {
    pendingAlertTimer = null;
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
  const rootCandidates = [
    document.querySelector('#chat-scrollable-area'),
    document.querySelector('.chat-scrollable-area__message-container'),
    document.querySelector('.chat-scrollable-area'),
    document.querySelector('[data-a-target="chat-scrollable-area__message-container"]')
  ].filter(Boolean);

  if (rootCandidates.length === 0) {
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
      settings.channelSettings = changes.channelSettings.newValue || {};
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
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'setSettings') {
      settings = { ...settings, ...message.settings };
      settings.sounds = Array.isArray(message.settings.sounds) && message.settings.sounds.length ? message.settings.sounds : DEFAULT_SOUNDS;
      settings.channelSettings = message.settings.channelSettings || {};
      settings.ignoreOwnMessages = Boolean(message.settings.ignoreOwnMessages);
      settings.mentionOnly = Boolean(message.settings.mentionOnly);
      settings.myUsername = String(message.settings.myUsername || '');
      settings.ignoredUsers = Array.isArray(message.settings.ignoredUsers) ? message.settings.ignoredUsers : DEFAULT_SETTINGS.ignoredUsers;
      settings.alertCooldownMs = Number(message.settings.alertCooldownMs || settings.alertCooldownMs || 0);
      settings.alertDebounceMs = Number(message.settings.alertDebounceMs || settings.alertDebounceMs || 1200);
      sendResponse({ ok: true });
    }
  });

  setupObserver();
}

start();
