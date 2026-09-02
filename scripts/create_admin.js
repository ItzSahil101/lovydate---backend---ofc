#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const bcrypt = require('bcryptjs');

// Ensure .env is loaded from backend directory
const backendEnvPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(backendEnvPath)) {
  require('dotenv').config({ path: backendEnvPath });
} else {
  require('dotenv').config();
}

const { pool } = require('../src/infrastructure/database/pool');

// Helper to parse CLI arguments (e.g. --email=foo@bar.com or --email foo@bar.com)
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const parts = arg.substring(2).split('=');
      const key = parts[0];
      const value = parts.length > 1 ? parts.slice(1).join('=') : args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      parsed[key] = value;
    } else if (arg.startsWith('-')) {
      const key = arg.substring(1);
      const value = args[i + 1] && !args[i + 1].startsWith('-') ? args[++i] : true;
      parsed[key] = value;
    }
  }

  return {
    email: parsed.email || parsed.e,
    password: parsed.password || parsed.p || parsed.pass,
    displayName: parsed.name || parsed.displayName || parsed.n,
    role: parsed.role || parsed.roles || parsed.r || 'SUPER_ADMIN',
  };
}

function askQuestion(rl, query, defaultValue = '') {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

const VALID_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'MODERATOR',
  'CONTENT_MODERATOR',
  'SUPPORT',
  'MARKETING',
  'ANALYST',
  'READ_ONLY',
];

async function main() {
  console.log('\n=============================================');
  console.log('       LovyDate Admin Account Creator       ');
  console.log('=============================================\n');

  let { email, password, displayName, role } = parseArgs();

  let rl;
  if (!email || !password || !displayName) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  try {
    if (!email) {
      email = await askQuestion(rl, 'Enter Admin Email: ');
    }
    if (!displayName) {
      displayName = await askQuestion(rl, 'Enter Display Name: ');
    }
    if (!password) {
      password = await askQuestion(rl, 'Enter Password: ');
    }
    if (!role) {
      role = await askQuestion(rl, 'Enter Role (default SUPER_ADMIN): ', 'SUPER_ADMIN');
    }

    if (rl) rl.close();

    email = String(email || '').trim().toLowerCase();
    displayName = String(displayName || '').trim();
    password = String(password || '').trim();

    if (!email || !password || !displayName) {
      console.error('\n❌ Error: Email, Display Name, and Password are all required.');
      process.exit(1);
    }

    const assignedRoles = String(role)
      .split(',')
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean);

    for (const r of assignedRoles) {
      if (!VALID_ROLES.includes(r)) {
        console.error(`\n❌ Error: Invalid role "${r}". Valid roles are: ${VALID_ROLES.join(', ')}`);
        process.exit(1);
      }
    }

    if (assignedRoles.length === 0) {
      assignedRoles.push('SUPER_ADMIN');
    }

    console.log('\nConnecting to database...');
    const client = await pool.connect();

    try {
      // Check existing user
      const existingRes = await client.query('SELECT id, email FROM admin_users WHERE email = $1', [email]);

      const passwordHash = await bcrypt.hash(password, 10);
      let adminId;

      if (existingRes.rows.length > 0) {
        adminId = existingRes.rows[0].id;
        console.log(`\nℹ️  Admin with email "${email}" already exists. Updating credentials & roles...`);
        await client.query(
          `UPDATE admin_users 
           SET password_hash = $1, display_name = $2, status = 'active', updated_at = NOW() 
           WHERE id = $3`,
          [passwordHash, displayName, adminId]
        );
      } else {
        const insertRes = await client.query(
          `INSERT INTO admin_users (email, password_hash, display_name, status) 
           VALUES ($1, $2, $3, 'active') 
           RETURNING id`,
          [email, passwordHash, displayName]
        );
        adminId = insertRes.rows[0].id;
      }

      // Assign roles
      for (const roleId of assignedRoles) {
        await client.query(
          `INSERT INTO admin_user_roles (admin_id, role_id) 
           VALUES ($1, $2) 
           ON CONFLICT DO NOTHING`,
          [adminId, roleId]
        );
      }

      console.log('\n✅ Admin account successfully created/updated!');
      console.log('---------------------------------------------');
      console.log(`🆔 ID:           ${adminId}`);
      console.log(`📧 Email:        ${email}`);
      console.log(`👤 Name:         ${displayName}`);
      console.log(`🛡️ Roles:        ${assignedRoles.join(', ')}`);
      console.log('---------------------------------------------\n');
      console.log('You can now log in at the LovyDate Admin Portal.\n');
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('\n❌ Failed to create admin account:', err.message || err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
