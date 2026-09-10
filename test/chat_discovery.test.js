const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

// Real PostgreSQL queries in an isolated in-memory database. External side
// effects are stubbed so these tests never contact a user's database or devices.
const db = new PGlite();
const query = async (sql, params) => {
  const result = await db.query(sql, params);
  return { ...result, rowCount: result.affectedRows ?? result.rows.length };
};
const stub = (relativePath, exports) => {
  const id = require.resolve(relativePath);
  require.cache[id] = { id, filename: id, loaded: true, exports };
};
stub('../src/infrastructure/database/pool', {
  query,
  withTransaction: (fn) => db.transaction((tx) => fn({ query: (sql, params) => tx.query(sql, params) })),
});
stub('../src/infrastructure/websocket/socketServer', { emitToConversation: () => {} });
stub('../src/infrastructure/firebase/fcm', { sendPushToUser: async () => {} });
stub('../src/modules/media/media.service', { isManagedMediaUrl: () => true });
stub('../src/middleware/restrictions', { assertNoRestriction: async () => {} });
stub('../src/infrastructure/redis/client', { del: async () => {}, rpush: async () => {}, expire: async () => {} });
stub('../src/infrastructure/queue/queueManager', { addJob: async () => {} });

const chat = require('../src/modules/chat/chat.service');
const chatRepo = require('../src/modules/chat/chat.repository');
const discovery = require('../src/modules/discovery/discovery.service');
const discoveryRepo = require('../src/modules/discovery/discovery.repository');
const { decodeCursor } = require('../src/shared/cursor');

const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';
const carol = '00000000-0000-4000-8000-000000000003';
const dave = '00000000-0000-4000-8000-000000000004';
const conversation = '00000000-0000-4000-8000-000000000010';
const otherConversation = '00000000-0000-4000-8000-000000000011';
const migration = (name) => fs.readFileSync(path.join(__dirname, '../migrations', name), 'utf8');

before(async () => {
  // gen_random_uuid is built into PostgreSQL; the optional legacy uuid-ossp
  // extension in the baseline is unnecessary for these schema tests.
  await db.exec(migration('001_initial_schema.sql').replace(/CREATE EXTENSION[^;]+;/g, ''));
  for (const file of ['002_profile_details.sql', '005_chat_attachments.sql',
    '006_privacy_settings.sql', '011_chat_message_actions.sql']) {
    await db.exec(migration(file));
  }
  await db.exec(migration('011_chat_message_actions.sql')); // migration is repeat-safe
});
after(async () => db.close());

beforeEach(async () => {
  await db.exec('TRUNCATE users CASCADE');
  for (const [id, name] of [[alice, 'Alice'], [bob, 'Bob'], [carol, 'Carol'], [dave, 'Dave']]) {
    await query('INSERT INTO users (id, email) VALUES ($1, $2)', [id, `${name}@example.test`]);
    await query(`INSERT INTO profiles (user_id, display_name, date_of_birth, gender, onboarding_completed)
      VALUES ($1, $2, '2000-01-01', 'Woman', TRUE)`, [id, name]);
  }
  await query(`INSERT INTO matches (id, user_one_id, user_two_id) VALUES ($1, $2, $3)`, [conversation, alice, bob]);
  await query(`INSERT INTO conversations (id, match_id) VALUES ($1, $1)`, [conversation]);
  await query(`INSERT INTO conversations (id) VALUES ($1)`, [otherConversation]);
  await query(`INSERT INTO conversation_members (conversation_id, user_id) VALUES
    ($1, $2), ($1, $3), ($4, $2), ($4, $5)`, [conversation, alice, bob, otherConversation, carol]);
});

test('reply targets must belong to this conversation and are returned with the reply', async () => {
  const original = await chat.sendMessage(conversation, alice, { content: 'Original' });
  const reply = await chat.sendMessage(conversation, bob, { content: 'Reply', replyToMessageId: original.id });
  assert.equal(reply.replyTo.content, 'Original');
  assert.equal(reply.replyTo.senderId, alice);
  await assert.rejects(chat.sendMessage(otherConversation, alice,
    { content: 'Wrong conversation', replyToMessageId: original.id }), { code: 'INVALID_REPLY_MESSAGE' });
});

test('only members may read or mutate messages and only sender may unsend', async () => {
  const message = await chat.sendMessage(conversation, alice, { content: 'Private' });
  await assert.rejects(chat.listMessages(conversation, carol), { statusCode: 403 });
  await assert.rejects(chat.reactToMessage(conversation, message.id, carol, { emoji: '❤️' }), { statusCode: 403 });
  await assert.rejects(chat.deleteMessageForMe(conversation, message.id, carol), { statusCode: 403 });
  await assert.rejects(chat.unsendMessage(conversation, message.id, bob), { code: 'MESSAGE_NOT_OWNED' });
  assert.equal((await chatRepo.getMessage(conversation, message.id, alice)).content, 'Private');
});

test('reaction replacement, removal and validation persist for both participants', async () => {
  const message = await chat.sendMessage(conversation, alice, { content: 'Hello' });
  await chat.reactToMessage(conversation, message.id, bob, { emoji: '❤️' });
  const updated = await chat.reactToMessage(conversation, message.id, bob, { emoji: '🔥' });
  assert.deepEqual(updated.reactions, [{ userId: bob, emoji: '🔥' }]);
  assert.deepEqual((await chat.listMessages(conversation, alice)).items[0].reactions, updated.reactions);
  await assert.rejects(chat.reactToMessage(conversation, message.id, bob, { emoji: 'invalid' }), { code: 'INVALID_REACTION' });
  const removed = await chat.reactToMessage(conversation, message.id, bob, { emoji: '' });
  assert.deepEqual(removed.reactions, []);
});

test('delete for me survives reload without deleting the other participants copy or quote', async () => {
  const message = await chat.sendMessage(conversation, alice, { content: 'Keep for Alice' });
  const reply = await chat.sendMessage(conversation, alice, { content: 'Quoted', replyToMessageId: message.id });
  await chat.deleteMessageForMe(conversation, message.id, bob);
  const bobMessages = (await chat.listMessages(conversation, bob)).items;
  assert.deepEqual(bobMessages.map((m) => m.id), [reply.id]);
  assert.equal(bobMessages[0].replyTo, null);
  assert.equal((await chat.listMessages(conversation, alice)).items.length, 2);
  assert.equal((await chatRepo.getMessage(conversation, reply.id, alice)).replyTo.content, 'Keep for Alice');
});

test('unsend scrubs media, text, reactions, reply previews and conversation previews', async () => {
  const image = await chat.sendMessage(conversation, alice, {
    type: 'image', content: 'Private caption', mediaUrl: 'https://example.test/private.jpg',
    mimeType: 'image/jpeg', sizeBytes: 100,
  });
  const reply = await chat.sendMessage(conversation, bob, { content: 'Reply', replyToMessageId: image.id });
  await chat.reactToMessage(conversation, image.id, bob, { emoji: '❤️' });
  const unsent = await chat.unsendMessage(conversation, image.id, alice);
  assert.equal(unsent.isUnsent, true);
  assert.equal(unsent.content, '');
  assert.equal(unsent.mediaUrl, null);
  assert.deepEqual(unsent.reactions, []);
  const quote = (await chatRepo.getMessage(conversation, reply.id, bob)).replyTo;
  assert.equal(quote.isUnsent, true);
  assert.equal(quote.content, '');
  const stored = (await query('SELECT content, media_url FROM messages WHERE id = $1', [image.id])).rows[0];
  assert.deepEqual(stored, { content: '', media_url: null });
  await assert.rejects(chat.reactToMessage(conversation, image.id, bob, { emoji: '❤️' }), { code: 'MESSAGE_UNSENT' });
  await assert.rejects(chat.sendMessage(conversation, bob, { content: 'Late reply', replyToMessageId: image.id }), { code: 'INVALID_REPLY_MESSAGE' });
  await chat.unsendMessage(conversation, reply.id, bob);
  assert.equal((await chat.listConversations(alice))[0].lastMessageContent, 'Message unsent');
});

test('seen receipts update without a new message and cannot move backwards or cross conversations', async () => {
  const older = await chat.sendMessage(conversation, alice, { content: 'First' });
  await query("UPDATE messages SET created_at = NOW() - INTERVAL '1 minute' WHERE id = $1", [older.id]);
  const latest = await chat.sendMessage(conversation, alice, { content: 'Second' });
  assert.equal((await chatRepo.getMessage(conversation, latest.id, alice)).isSeen, false);
  await chat.markRead(conversation, bob, latest.id);
  assert.equal((await chatRepo.getMessage(conversation, latest.id, alice)).isSeen, true);
  await chat.markRead(conversation, bob, older.id);
  assert.equal((await chatRepo.getMessage(conversation, latest.id, alice)).isSeen, true);
  await assert.rejects(chat.markRead(otherConversation, alice, latest.id), { statusCode: 404 });
});

test('deleted and unsent messages disappear from unread counts and deleted previews', async () => {
  const first = await chat.sendMessage(conversation, alice, { content: 'Hide' });
  await chat.deleteMessageForMe(conversation, first.id, bob);
  let list = await chat.listConversations(bob);
  assert.equal(list[0].unreadCount, 0);
  assert.equal(list[0].lastMessageContent, null);
  const second = await chat.sendMessage(conversation, alice, { content: 'Unsend' });
  await chat.unsendMessage(conversation, second.id, alice);
  list = await chat.listConversations(bob);
  assert.equal(list[0].unreadCount, 0);
  assert.equal(list[0].lastMessageContent, 'Message unsent');
});

test('Discover works for members without a preferences row and candidates without location', async () => {
  await query('INSERT INTO user_locations (user_id, latitude, longitude) VALUES ($1, 27.7, 85.3)', [alice]);
  const prefs = await discoveryRepo.getUserPreferencesAndLocation(alice);
  assert.equal(prefs.latitude, 27.7);
  assert.equal(prefs.allowOutsidePreferences, true);
  const feed = await discovery.getDiscoveryFeed(alice);
  assert.deepEqual(new Set(feed.items.map((p) => p.id)), new Set([carol, dave]));
});

test('Discover explicit distance filters work, including identical coordinates', async () => {
  await query('INSERT INTO user_locations (user_id, latitude, longitude) VALUES ($1, 27.7, 85.3), ($2, 27.7, 85.3)', [alice, carol]);
  const feed = await discovery.getDiscoveryFeed(alice, 20, null, { maxDistanceKm: '5' });
  assert.deepEqual(feed.items.map((p) => p.id), [carol]);
});

test('Discover pagination advances and does not repeat previous profiles', async () => {
  const first = await discovery.getDiscoveryFeed(alice, 1);
  assert.equal(first.items.length, 1);
  assert.equal(first.hasMore, true);
  assert.equal(decodeCursor(first.nextCursor).offset, 1);
  const second = await discovery.getDiscoveryFeed(alice, 1, first.nextCursor);
  assert.equal(second.items.length, 1);
  assert.notEqual(second.items[0].id, first.items[0].id);
  assert.equal(second.hasMore, false);
});
