const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function load() {
  const context = vm.createContext({ URL, window: { location: { pathname: '/example' } } });
  vm.runInContext(fs.readFileSync('shared.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('content.js', 'utf8').replace(/start\(\);\s*$/, ''), context);
  return expression => vm.runInContext(expression, context);
}
test('channel names, Twitch links and popout paths resolve consistently', () => {
  const run = load();
  for (const input of ['Example', '@example', 'https://www.twitch.tv/example', '/popout/example/chat', '/moderator/example']) {
    assert.equal(run(`normalizeChannelName(${JSON.stringify(input)})`), 'example');
  }
});
test('navigation pages and foreign URLs never become channels', () => {
  const run = load();
  for (const input of ['/directory/category/games', '/videos/12345', '/settings/profile', 'https://example.com/user', '/search', 'bad name']) {
    assert.equal(run(`normalizeChannelName(${JSON.stringify(input)})`), '');
  }
});
test('channels require explicit activation and respect disabled state', () => {
  const run = load();
  assert.equal(run('isChannelEnabled()'), false);
  run("settings.channelSettings = { example: { enabled: true } }");
  assert.equal(run('isChannelEnabled()'), true);
  run("settings.channelSettings.example.enabled = false");
  assert.equal(run('isChannelEnabled()'), false);
});
test('mention filter requires a username and matches full usernames', () => {
  const run = load();
  assert.equal(run("isMentionedMessage({ textContent: 'hello' })"), false);
  run("settings.myUsername = 'robson'");
  assert.equal(run("isMentionedMessage({ textContent: 'oi @Robson!' })"), true);
  assert.equal(run("isMentionedMessage({ textContent: '@robson123' })"), false);
});
test('legacy channel settings migrate', () => {
  const run = load();
  assert.equal(run("normalizeChannelSettingsMap({ '@Example': true }).example.enabled"), true);
});
