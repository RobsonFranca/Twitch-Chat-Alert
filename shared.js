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

function normalizeChannelName(value) {
  let raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.hostname !== 'twitch.tv' && !url.hostname.endsWith('.twitch.tv')) return '';
    raw = url.pathname;
  } catch { /* Accept a channel name or path. */ }
  const parts = raw.replace(/^@/, '').split('/').filter(Boolean);
  const reserved = ['videos', 'directory', 'settings', 'search', 'downloads', 'subscriptions', 'inventory', 'wallet', 'jobs', 'turbo', 'p', 'friends'];
  const candidate = ['popout', 'moderator'].includes(parts[0]) ? parts[1] : parts[0];
  return candidate && !reserved.includes(candidate) && /^[a-z0-9_]{1,25}$/.test(candidate) ? candidate : '';
}

async function playAlertSound(sound, volume) {
  if (sound.type === 'url') {
    const audio = new Audio(sound.url);
    audio.volume = volume;
    await audio.play();
    return;
  }
  const context = new AudioContext();
  try {
    await context.resume();
    let offset = 0;
    const sequence = sound.sequence || [sound];
    for (const entry of sequence) {
      const start = context.currentTime + offset;
      const duration = entry.duration || sound.duration || 0.3;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = entry.waveform || sound.waveform || 'sine';
      oscillator.frequency.value = entry.frequency || sound.frequency || 880;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration);
      offset += duration;
    }
    setTimeout(() => context.close(), (offset + 0.1) * 1000);
  } catch (error) {
    await context.close();
    throw error;
  }
}
