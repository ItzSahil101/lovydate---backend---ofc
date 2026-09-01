function encodeCursor(payload) {
  try {
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  } catch {
    return null;
  }
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = {
  encodeCursor,
  decodeCursor,
};
