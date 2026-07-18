/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import sqlite3 from 'sqlite3';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import AdmZip from 'adm-zip';
import nodemailer from 'nodemailer';

const app = express();
const PORT = 3000;

// CORS Middleware to support external frontends (like Cloudflare Pages) calling VPS backend
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Standard middleware
app.use(express.json());
app.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Cú pháp dữ liệu JSON truyền tải không hợp lệ' });
  }
  next();
});

// Set up SQLite Database
const dbPath = path.resolve(process.cwd(), 'social.db');
const db = new sqlite3.Database(dbPath);

// Secret for custom signed session tokens
const TOKEN_SECRET = 'znet_super_secret_key_987654321';

// Promisify SQLite methods for async/await usage
const dbRun = (sql: string, params: any[] = []): Promise<{ id: number; changes: number }> => {
  return new Promise((resolve, reject) => {
    try {
      db.run(sql, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    } catch (e) {
      reject(e);
    }
  });
};

const dbGet = (sql: string, params: any[] = []): Promise<any> => {
  return new Promise((resolve, reject) => {
    try {
      db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
};

const dbAll = (sql: string, params: any[] = []): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    try {
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
};

// Initialize SQLite database schema
async function initializeDatabase() {
  try {
    console.log("Initializing SQLite Database on ZNet...");
    await dbRun(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        two_factor_secret TEXT,
        two_factor_enabled INTEGER DEFAULT 0,
        avatar TEXT,
        status TEXT DEFAULT 'Hi there! I am using ZNet!',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add role column to users table if not already exists (migration)
    try {
      await dbRun(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`);
      console.log("Database user table migrated: role column added!");
    } catch (_) {
      // Column already exists, ignore
    }

    try {
      await dbRun(`ALTER TABLE users ADD COLUMN google_id TEXT`);
      console.log("Database user table migrated: google_id column added!");
    } catch (_) {}

    try {
      await dbRun(`ALTER TABLE users ADD COLUMN email TEXT`);
      console.log("Database user table migrated: email column added!");
    } catch (_) {}

    try {
      await dbRun(`ALTER TABLE users ADD COLUMN password_reset_code TEXT`);
      console.log("Database user table migrated: password_reset_code column added!");
    } catch (_) {}

    try {
      await dbRun(`ALTER TABLE users ADD COLUMN password_reset_expires DATETIME`);
      console.log("Database user table migrated: password_reset_expires column added!");
    } catch (_) {}

    try {
      await dbRun(`ALTER TABLE users ADD COLUMN auto_delete_pms INTEGER DEFAULT 0`);
      console.log("Database user table migrated: auto_delete_pms column added!");
    } catch (_) {}

    try {
      await dbRun(`ALTER TABLE users ADD COLUMN auto_delete_groups INTEGER DEFAULT 0`);
      console.log("Database user table migrated: auto_delete_groups column added!");
    } catch (_) {}

    await dbRun(`
      CREATE TABLE IF NOT EXISTS friends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        friend_id INTEGER NOT NULL,
        status TEXT NOT NULL, -- 'pending', 'accepted'
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (friend_id) REFERENCES users (id),
        UNIQUE(user_id, friend_id)
      )
    `);

    await dbRun(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER NOT NULL,
        receiver_id INTEGER NOT NULL,
        message_text TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        read_status INTEGER DEFAULT 0,
        FOREIGN KEY (sender_id) REFERENCES users (id),
        FOREIGN KEY (receiver_id) REFERENCES users (id)
      )
    `);

    // Migration for messages table columns
    try {
      await dbRun(`ALTER TABLE messages ADD COLUMN is_recalled INTEGER DEFAULT 0`);
      console.log("[ZNET LOG] Migrated messages table: added is_recalled");
    } catch (_) {}
    try {
      await dbRun(`ALTER TABLE messages ADD COLUMN deleted_by_sender INTEGER DEFAULT 0`);
      console.log("[ZNET LOG] Migrated messages table: added deleted_by_sender");
    } catch (_) {}
    try {
      await dbRun(`ALTER TABLE messages ADD COLUMN deleted_by_receiver INTEGER DEFAULT 0`);
      console.log("[ZNET LOG] Migrated messages table: added deleted_by_receiver");
    } catch (_) {}

    // Shared real-time social timeline feed table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS feeds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        likes_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // Feed comments table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feed_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (feed_id) REFERENCES feeds (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // Feed unique likes table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS feed_likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feed_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(feed_id, user_id),
        FOREIGN KEY (feed_id) REFERENCES feeds (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // Chat groups tables
    await dbRun(`
      CREATE TABLE IF NOT EXISTS chat_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration for chat_groups columns
    try {
      await dbRun(`ALTER TABLE chat_groups ADD COLUMN is_private INTEGER DEFAULT 0`);
      console.log("[ZNET LOG] Migrated chat_groups table: added is_private");
    } catch (_) {}
    try {
      await dbRun(`ALTER TABLE chat_groups ADD COLUMN creator_id INTEGER`);
      console.log("[ZNET LOG] Migrated chat_groups table: added creator_id");
    } catch (_) {}

    await dbRun(`
      CREATE TABLE IF NOT EXISTS group_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES chat_groups (id),
        FOREIGN KEY (user_id) REFERENCES users (id),
        UNIQUE(group_id, user_id)
      )
    `);

    await dbRun(`
      CREATE TABLE IF NOT EXISTS group_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        sender_id INTEGER NOT NULL,
        message_text TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES chat_groups (id),
        FOREIGN KEY (sender_id) REFERENCES users (id)
      )
    `);

    // Migration for group_messages columns
    try {
      await dbRun(`ALTER TABLE group_messages ADD COLUMN is_recalled INTEGER DEFAULT 0`);
      console.log("[ZNET LOG] Migrated group_messages table: added is_recalled");
    } catch (_) {}
    try {
      await dbRun(`ALTER TABLE group_messages ADD COLUMN deleted_by_users TEXT DEFAULT ''`);
      console.log("[ZNET LOG] Migrated group_messages table: added deleted_by_users");
    } catch (_) {}

    // Group Join Requests Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS group_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'rejected'
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES chat_groups (id),
        FOREIGN KEY (user_id) REFERENCES users (id),
        UNIQUE(group_id, user_id)
      )
    `);

    // Seed default administrator if not present
    const existingAdmin = await dbGet('SELECT id FROM users WHERE username = ?', ['admin']);
    if (!existingAdmin) {
      const adminPwdHash = hashPassword('admin@123');
      await dbRun(
        `INSERT INTO users (username, password_hash, status, avatar, role) VALUES (?, ?, ?, ?, ?)`,
        ['admin', adminPwdHash, 'Hệ thống Admin & Điều hành tối cao ZNet', 'https://api.dicebear.com/7.x/pixel-art/svg?seed=admin', 'admin']
      );
      console.log("Seeded default master admin user: username=admin, password=admin@123");
    }

    console.log("SQLite Database initialized successfully!");
  } catch (error) {
    console.error("Database initialization failed:", error);
  }
}

// Custom JWT Signer (Pure TypeScript logic with Zero external library risk)
function signToken(payload: { id: number; username: string }): string {
  try {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payloadBuffer = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 86400000 })).toString('base64url');
    const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(`${header}.${payloadBuffer}`).digest('base64url');
    return `${header}.${payloadBuffer}.${signature}`;
  } catch (err) {
    console.error("Error signing auth token:", err);
    throw new Error("Token signing failed");
  }
}

function verifyToken(token: string): { id: number; username: string } | null {
  try {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const verifiedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(`${header}.${payload}`).digest('base64url');
    if (signature !== verifiedSig) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (Date.now() > data.exp) return null; // Expired
    return { id: data.id, username: data.username };
  } catch (err) {
    console.error("Error verifying verification token:", err);
    return null;
  }
}

// Decodes a standard Base32 encoded string into a Buffer (for TOTP)
function decodeBase32(base32Str: string): Buffer {
  try {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const cleaned = base32Str.toUpperCase().replace(/=/g, '');
    let bits = '';
    for (let i = 0; i < cleaned.length; i++) {
      const idx = alphabet.indexOf(cleaned[i]);
      if (idx === -1) continue;
      bits += idx.toString(2).padStart(5, '0');
    }
    const bytes: number[] = [];
    for (let i = 0; i < bits.length; i += 8) {
      if (i + 8 <= bits.length) {
        bytes.push(parseInt(bits.substring(i, i + 8), 2));
      }
    }
    return Buffer.from(bytes);
  } catch (err) {
    console.error("Base32 decoding failed:", err);
    return Buffer.alloc(0);
  }
}

// Generates a 6-digit TOTP validation code based on a Base32 key and step index
function getTOTPCode(secretBase32: string, timeWindow: number): string {
  try {
    const key = decodeBase32(secretBase32);
    const buffer = Buffer.alloc(8);
    let tempWindow = timeWindow;
    for (let i = 7; i >= 0; i--) {
      buffer[i] = tempWindow & 0xff;
      tempWindow = Math.floor(tempWindow / 256);
    }
    const hmac = crypto.createHmac('sha1', key);
    hmac.update(buffer);
    const hmacResult = hmac.digest();
    const offset = hmacResult[hmacResult.length - 1] & 0xf;
    const code =
      ((hmacResult[offset] & 0x7f) << 24) |
      ((hmacResult[offset + 1] & 0xff) << 16) |
      ((hmacResult[offset + 2] & 0xff) << 8) |
      (hmacResult[offset + 3] & 0xff);
    const pin = (code % 1000000).toString().padStart(6, '0');
    return pin;
  } catch (err) {
    console.error("TOTP code generation error:", err);
    return "";
  }
}

// Verifies a 6-digit TOTP code with time-drift check (-1, 0, +1 windows)
function verifyTOTP(secretBase32: string, userToken: string): boolean {
  try {
    if (!userToken || userToken.length !== 6) return false;
    const currentWindow = Math.floor(Date.now() / 1000 / 30);
    for (let drift = -1; drift <= 1; drift++) {
      const computed = getTOTPCode(secretBase32, currentWindow + drift);
      if (computed === userToken) {
        return true;
      }
    }
    return false;
  } catch (err) {
    console.error("TOTP verification error:", err);
    return false;
  }
}

// Generates a random Base32 string (16 characters) for TOTP setup
function generateBase32Secret(): string {
  try {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let result = '';
    const bytes = crypto.randomBytes(16);
    for (let i = 0; i < bytes.length; i++) {
      result += alphabet[bytes[i] % alphabet.length];
    }
    return result;
  } catch (e) {
    console.error("Generation of Base32 secret failed", e);
    return 'JBSWY3DPEHPK3PXP'; // Safe fallback secret (though random is preferred)
  }
}

// Password Hashing Helper
function hashPassword(password: string): string {
  try {
    return crypto.createHash('sha256').update(password + '_znet_salt_123').digest('hex');
  } catch (error) {
    console.error("Hashing password failed:", error);
    return password;
  }
}

// Middleware to protect API routes
async function authenticateUserMiddleware(req: any, res: any, next: any) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Bạn cần đăng nhập để truy cập dữ liệu này' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ' });
    }
    req.user = decoded;
    next();
  } catch (error) {
    console.error("Authentication middleware error:", error);
    res.status(500).json({ error: 'Đã xảy ra lỗi bảo mật hệ thống' });
  }
}

// -- API Routes --

// Register Endpoint
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, avatar, email, otp } = req.body;
    if (!username || !password || !email) {
      return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ tài khoản, mật khẩu và địa chỉ email' });
    }
    
    const cleanUsername = username.trim();
    if (cleanUsername.length < 3) {
      return res.status(400).json({ error: 'Tên tài khoản phải chứa ít nhất 3 ký tự' });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.includes('@')) {
      return res.status(400).json({ error: 'Địa chỉ email không đúng định dạng' });
    }

    const existingUser = await dbGet('SELECT id FROM users WHERE username = ?', [cleanUsername]);
    if (existingUser) {
      return res.status(400).json({ error: 'Tên tài khoản đã tồn tại trong hệ thống' });
    }

    const existingEmail = await dbGet('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existingEmail) {
      return res.status(400).json({ error: 'Địa chỉ email này đã được đăng ký bởi tài khoản khác' });
    }

    // If otp is not provided, send verification code
    if (!otp) {
      // Generate random 6-digit OTP code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Store pending registration info
      pendingRegistrations.set(cleanEmail, {
        username: cleanUsername,
        passwordHash: hashPassword(password),
        avatar: avatar || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${cleanUsername}`,
        email: cleanEmail,
        otp: code,
        expiresAt: Date.now() + 15 * 60 * 1000
      });

      console.log(`[REGISTER OTP] Generated code for ${cleanEmail}: ${code}`);

      // Send the real email
      try {
        await sendOTPEmail(
          cleanEmail,
          cleanUsername,
          code,
          'Mã xác thực đăng ký tài khoản ZNet',
          'thiết lập tài khoản mới'
        );
      } catch (mailError: any) {
        console.error("Nodemailer registration send failing:", mailError);
        return res.status(500).json({
          error: `Không thể gửi mã xác nhận tới Email của bạn: ${mailError.message || 'Lỗi SMTP'}`
        });
      }

      return res.json({
        requireOTP: true,
        message: `Hệ thống đã gửi một mã xác minh OTP gồm 6 chữ số tới Email ${cleanEmail}. Vui lòng nhập mã để hoàn tất đăng ký!`
      });
    }

    // OTP is provided, verify it
    const pending = pendingRegistrations.get(cleanEmail);
    if (!pending) {
      console.warn(`[REGISTER ERROR] No pending registration found for email key: "${cleanEmail}". Current keys:`, Array.from(pendingRegistrations.keys()));
      return res.status(400).json({ error: 'Mã xác minh OTP không chính xác, đã hết hạn hoặc không tồn tại' });
    }
    if (pending.expiresAt < Date.now()) {
      console.warn(`[REGISTER ERROR] Pending registration expired for "${cleanEmail}". Expired at: ${pending.expiresAt}, now is: ${Date.now()}`);
      return res.status(400).json({ error: 'Mã xác minh OTP đã hết hạn' });
    }
    if (pending.otp !== otp.trim()) {
      console.warn(`[REGISTER ERROR] OTP mismatch for "${cleanEmail}". Expected: "${pending.otp}", Received: "${otp.trim()}"`);
      return res.status(400).json({ error: 'Mã xác minh OTP không chính xác' });
    }

    // Valid OTP! Now proceed to register
    const result = await dbRun(
      'INSERT INTO users (username, password_hash, avatar, email) VALUES (?, ?, ?, ?)',
      [pending.username, pending.passwordHash, pending.avatar, pending.email]
    );

    // Clean cache
    pendingRegistrations.delete(cleanEmail);

    res.json({ success: true, message: 'Đăng ký tài khoản ZNet thành công! Vui lòng tiến hành đăng nhập.', userId: result.id });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: 'Đăng ký thất bại do sự cố máy chủ' });
  }
});

// Ping check endpoint for diagnostics
app.get('/api/ping', (req, res) => {
  res.json({ success: true, status: 'ok', message: 'ZNet Backend is alive and kicking!' });
});

// Login Endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, otp } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ tài khoản và mật khẩu' });
    }

    const cleanUsername = username.trim();
    const user = await dbGet('SELECT * FROM users WHERE username = ?', [cleanUsername]);
    if (!user) {
      return res.status(400).json({ error: 'Sai tài khoản hoặc mật khẩu' });
    }

    const verifiedHash = hashPassword(password);
    if (user.password_hash !== verifiedHash) {
      return res.status(400).json({ error: 'Sai tài khoản hoặc mật khẩu' });
    }

    // Check if 2FA is active
    if (user.two_factor_enabled === 1) {
      if (!otp) {
        return res.json({ require2FA: true, message: 'Yêu cầu mã xác thực 2FA' });
      }
      const verified2FA = verifyTOTP(user.two_factor_secret, otp);
      if (!verified2FA) {
        return res.status(400).json({ error: 'Mã OTP 2FA không chính xác hoặc đã hết hạn' });
      }
    }

    const token = signToken({ id: user.id, username: user.username });
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        status: user.status,
        twoFactorEnabled: user.two_factor_enabled === 1,
        role: user.role || 'user'
      }
    });
  } catch (err) {
    console.error("Login endpoint exception:", err);
    res.status(500).json({ error: 'Đăng nhập thất bại do kết nối máy chủ' });
  }
});

// Google Sign-In Endpoint
app.post('/api/auth/google-signin', async (req, res) => {
  try {
    const { googleId, email, displayName, photoURL, otp } = req.body;
    if (!googleId || !email) {
      return res.status(400).json({ error: 'Thiếu thông tin Google ID hoặc Email' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // If OTP is not provided, send confirmation code to the Google Email
    if (!otp) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();

      pendingGoogleLogins.set(cleanEmail, {
        googleId,
        email: cleanEmail,
        displayName: displayName || '',
        photoURL: photoURL || '',
        otp: code,
        expiresAt: Date.now() + 15 * 60 * 1000
      });

      console.log(`[GOOGLE SIGNIN OTP] Generated code for ${cleanEmail}: ${code}`);

      // Send Email
      try {
        await sendOTPEmail(
          cleanEmail,
          displayName || cleanEmail.split('@')[0],
          code,
          'Mã xác thực đăng nhập Google',
          'truy cập tài khoản bằng tài khoản Google'
        );
      } catch (mailError: any) {
        console.error("Nodemailer google-signin send failing:", mailError);
        return res.status(500).json({
          error: `Không thể gửi mã xác nhận tới Email Google của bạn: ${mailError.message || 'Lỗi SMTP'}`
        });
      }

      return res.json({
        requireOTP: true,
        message: `Hệ thống đã gửi mã xác thực OTP gồm 6 chữ số tới Email Google (${cleanEmail}) của bạn để hoàn tất đăng nhập!`
      });
    }

    // OTP is provided, verify it
    const pending = pendingGoogleLogins.get(cleanEmail);
    if (!pending) {
      console.warn(`[ZNET GOOGLE ERROR] No pending login found for email key: "${cleanEmail}". Current keys:`, Array.from(pendingGoogleLogins.keys()));
      return res.status(400).json({ error: 'Mã xác minh OTP không chính xác hoặc đã hết hạn' });
    }
    if (pending.expiresAt < Date.now()) {
      console.warn(`[ZNET GOOGLE ERROR] Pending login expired for "${cleanEmail}". Expired at: ${pending.expiresAt}, now is: ${Date.now()}`);
      return res.status(400).json({ error: 'Mã xác minh OTP đã hết hạn' });
    }
    if (pending.otp !== otp.trim()) {
      console.warn(`[ZNET GOOGLE ERROR] OTP mismatch for "${cleanEmail}". Expected: "${pending.otp}", Received: "${otp.trim()}"`);
      return res.status(400).json({ error: 'Mã xác minh OTP không chính xác' });
    }

    // OTP verified successfully! Clear cache
    pendingGoogleLogins.delete(cleanEmail);

    // 1. Check if user already exists by googleId
    let user = await dbGet('SELECT * FROM users WHERE google_id = ?', [googleId]);

    // 2. If not found by googleId, check by email
    if (!user) {
      user = await dbGet('SELECT * FROM users WHERE email = ?', [cleanEmail]);
      if (user) {
        // Link googleId to this existing account
        await dbRun('UPDATE users SET google_id = ? WHERE id = ?', [googleId, user.id]);
        user.google_id = googleId;
        console.log(`[ZNET GOOGLE] Linked Google Account for existing user: ${user.username}`);
      }
    }

    // 3. If still not found, create a new user
    if (!user) {
      // Create a unique username
      let baseUsername = (pending.displayName || cleanEmail.split('@')[0]).trim().replace(/\s+/g, '_');
      // Strip special characters for username compatibility
      baseUsername = baseUsername.replace(/[^a-zA-Z0-9_]/g, '');
      if (baseUsername.length < 3) baseUsername = "user_" + Math.floor(Math.random() * 1000);

      let finalUsername = baseUsername;
      let suffix = 1;
      // Loop to ensure username is unique
      while (true) {
        const check = await dbGet('SELECT id FROM users WHERE username = ?', [finalUsername]);
        if (!check) break;
        finalUsername = `${baseUsername}_${suffix}`;
        suffix++;
      }

      // Generate random secure password hash
      const randomPassword = crypto.randomBytes(16).toString('hex');
      const pwdHash = hashPassword(randomPassword);
      const avatar = pending.photoURL || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${finalUsername}`;

      const result = await dbRun(
        'INSERT INTO users (username, password_hash, google_id, email, avatar, status) VALUES (?, ?, ?, ?, ?, ?)',
        [finalUsername, pwdHash, googleId, cleanEmail, avatar, 'Tôi tham gia ZNet bằng tài khoản Google!']
      );

      user = await dbGet('SELECT * FROM users WHERE id = ?', [result.id]);
      console.log(`[ZNET GOOGLE] Created new Google user: ${finalUsername}`);
    }

    // 4. Issue custom ZNet JWT token
    const token = signToken({ id: user.id, username: user.username });
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        status: user.status,
        twoFactorEnabled: user.two_factor_enabled === 1,
        role: user.role || 'user',
        googleId: user.google_id || null,
        email: user.email || null
      }
    });
  } catch (err) {
    console.error("Google Sign-In endpoint error:", err);
    res.status(500).json({ error: 'Đăng nhập Google thất bại do lỗi hệ thống máy chủ' });
  }
});

// Google Link Account Endpoint
app.post('/api/auth/google-link', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const { googleId, email } = req.body;
    if (!googleId || !email) {
      return res.status(400).json({ error: 'Thiếu thông tin Google ID hoặc Email' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if this googleId is already linked to ANOTHER user
    const existing = await dbGet('SELECT id, username FROM users WHERE google_id = ? AND id != ?', [googleId, req.user.id]);
    if (existing) {
      return res.status(400).json({ error: `Tài khoản Google này đã được liên kết với người dùng khác (${existing.username})` });
    }

    // Update the current user
    await dbRun('UPDATE users SET google_id = ?, email = ? WHERE id = ?', [googleId, cleanEmail, req.user.id]);
    res.json({
      success: true,
      message: 'Liên kết tài khoản Google thành công!',
      googleId,
      email
    });
  } catch (err) {
    console.error("Google link error:", err);
    res.status(505).json({ error: 'Không thể liên kết tài khoản Google do lỗi máy chủ' });
  }
});

// In-memory memory caches for real Email OTP verifications
interface PendingRegistration {
  username: string;
  passwordHash: string;
  avatar: string;
  email: string;
  otp: string;
  expiresAt: number;
}

interface PendingGoogleLogin {
  googleId: string;
  email: string;
  displayName: string;
  photoURL: string;
  otp: string;
  expiresAt: number;
}

const pendingRegistrations = new Map<string, PendingRegistration>();
const pendingGoogleLogins = new Map<string, PendingGoogleLogin>();

// Helper to send real emails via Nodemailer with pre-configured secure Gmail defaults
async function sendOTPEmail(toEmail: string, username: string, otp: string, subject: string, actionText: string): Promise<boolean> {
  const host = 'smtp.gmail.com';
  const port = '465';
  const user = 'opaas315@gmail.com';
  const pass = 'nmfpwjuvxcplyyxq';
  const from = '"ZNet Security" <opaas315@gmail.com>';

  const transporter = nodemailer.createTransport({
    host: host.trim(),
    port: parseInt(port.trim(), 10),
    secure: true, // SSL for 465
    auth: {
      user: user.trim(),
      pass: pass.trim(),
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  const mailOptions = {
    from,
    to: toEmail,
    subject: `[ZNet] ${subject}: ${otp}`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 550px; margin: 0 auto; padding: 30px; background-color: #0f172a; border-radius: 16px; color: #f8fafc; border: 1px solid #1e293b; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);">
        <div style="text-align: center; margin-bottom: 25px;">
          <h2 style="color: #6366f1; font-size: 28px; font-weight: 800; margin: 0; letter-spacing: 1px; text-transform: uppercase;">ZNet Security</h2>
          <p style="color: #94a3b8; font-size: 13px; margin: 5px 0 0 0;">Cổng Xác Thực An Toàn ZNet</p>
        </div>
        
        <div style="background-color: #1e293b; border-radius: 12px; padding: 20px; border: 1px solid #334155; margin-bottom: 25px;">
          <p style="margin: 0 0 15px 0; font-size: 14px; color: #cbd5e1; line-height: 1.6;">
            Xin chào <strong>${username}</strong>,
          </p>
          <p style="margin: 0 0 20px 0; font-size: 14px; color: #cbd5e1; line-height: 1.6;">
            Chúng tôi nhận được yêu cầu ${actionText} cho tài khoản ZNet liên kết với Email này. Dưới đây là mã xác minh OTP bảo mật của bạn:
          </p>
          
          <div style="text-align: center; margin: 25px 0; padding: 15px; background-color: #020617; border-radius: 10px; border: 1.5px dashed #4f46e5;">
            <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #34d399; display: inline-block;">${otp}</span>
          </div>
          
          <p style="margin: 0; font-size: 12px; color: #cbd5e1; line-height: 1.5; background-color: rgba(245, 158, 11, 0.1); padding: 10px; border-radius: 6px; border-left: 3px solid #f59e0b;">
            ⚠️ <strong>Lưu ý bảo mật:</strong> Mã xác thực này có hiệu lực trong vòng <strong>15 phút</strong>. Tuyệt đối không chia sẻ mã này với bất kỳ ai để bảo vệ an toàn tài khoản.
          </p>
        </div>
        
        <div style="text-align: center; border-top: 1px solid #1e293b; padding-top: 20px; font-size: 11px; color: #64748b;">
          <p style="margin: 0 0 5px 0;">Yêu cầu này được gửi từ cổng bảo mật ZNet Applet.</p>
          <p style="margin: 0;">&copy; 2026 ZNet Inc. All rights reserved.</p>
        </div>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  return true;
}

// Helper to send real emails via Nodemailer
async function sendResetEmailViaNodemailer(toEmail: string, username: string, resetCode: string): Promise<{ success: boolean; etherealUrl?: string }> {
  const host = 'smtp.gmail.com';
  const port = '465';
  const user = 'opaas315@gmail.com';
  const pass = 'nmfpwjuvxcplyyxq';
  const from = '"ZNet Security" <opaas315@gmail.com>';

  const transporter = nodemailer.createTransport({
    host: host.trim(),
    port: parseInt(port.trim(), 10),
    secure: true, // SSL for 465
    auth: {
      user: user.trim(),
      pass: pass.trim(),
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  const mailOptions = {
    from,
    to: toEmail,
    subject: `[ZNet] Mã xác thực khôi phục mật khẩu tài khoản: ${resetCode}`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 550px; margin: 0 auto; padding: 30px; background-color: #0f172a; border-radius: 16px; color: #f8fafc; border: 1px solid #1e293b; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);">
        <div style="text-align: center; margin-bottom: 25px;">
          <h2 style="color: #6366f1; font-size: 28px; font-weight: 800; margin: 0; letter-spacing: 1px; text-transform: uppercase;">ZNet Security</h2>
          <p style="color: #94a3b8; font-size: 13px; margin: 5px 0 0 0;">Hệ thống Khôi phục Mật khẩu Tài khoản</p>
        </div>
        
        <div style="background-color: #1e293b; border-radius: 12px; padding: 20px; border: 1px solid #334155; margin-bottom: 25px;">
          <p style="margin: 0 0 15px 0; font-size: 14px; color: #cbd5e1; line-height: 1.6;">
            Xin chào <strong>${username}</strong>,
          </p>
          <p style="margin: 0 0 20px 0; font-size: 14px; color: #cbd5e1; line-height: 1.6;">
            Chúng tôi nhận được yêu cầu khôi phục mật khẩu cho tài khoản ZNet của bạn. Dưới đây là mã xác minh OTP của bạn:
          </p>
          
          <div style="text-align: center; margin: 25px 0; padding: 15px; background-color: #020617; border-radius: 10px; border: 1.5px dashed #4f46e5;">
            <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #34d399; display: inline-block;">${resetCode}</span>
          </div>
          
          <p style="margin: 0; font-size: 12px; color: #cbd5e1; line-height: 1.5; background-color: rgba(245, 158, 11, 0.1); padding: 10px; border-radius: 6px; border-left: 3px solid #f59e0b;">
            ⚠️ <strong>Lưu ý bảo mật:</strong> Mã xác thực này có hiệu lực trong vòng <strong>15 phút</strong>. Tuyệt đối không chia sẻ mã này với bất kỳ ai để bảo vệ an toàn tài khoản.
          </p>
        </div>
        
        <div style="text-align: center; border-top: 1px solid #1e293b; padding-top: 20px; font-size: 11px; color: #64748b;">
          <p style="margin: 0 0 5px 0;">Yêu cầu này được gửi từ cổng bảo mật ZNet Applet.</p>
          <p style="margin: 0;">&copy; 2026 ZNet Inc. All rights reserved.</p>
        </div>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  return { success: true };
}

// Forgot Password Endpoint
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { usernameOrEmail } = req.body;
    if (!usernameOrEmail) {
      return res.status(400).json({ error: 'Vui lòng cung cấp tên tài khoản hoặc email của bạn' });
    }

    // Lookup user by username or email
    const user = await dbGet('SELECT id, username, email FROM users WHERE username = ? OR email = ?', [usernameOrEmail, usernameOrEmail]);
    if (!user) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản người dùng tương ứng' });
    }

    if (!user.email) {
      return res.status(400).json({
        error: 'Tài khoản của bạn chưa có địa chỉ email liên kết, do đó không thể gửi mã xác nhận thực tế. Vui lòng đăng ký tài khoản mới kèm email hoặc liên kết tài khoản với Google trước.'
      });
    }

    // Generate random 6-digit OTP code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    // Expires in 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Send the real email
    let etherealUrl: string | undefined;
    try {
      const mailResult = await sendResetEmailViaNodemailer(user.email, user.username, resetCode);
      etherealUrl = mailResult.etherealUrl;
    } catch (mailError: any) {
      console.error("Nodemailer sending failed:", mailError);
      return res.status(500).json({
        error: `Không thể gửi Email thực tế: ${mailError.message || 'Lỗi kết nối SMTP'}`
      });
    }

    await dbRun(
      'UPDATE users SET password_reset_code = ?, password_reset_expires = ? WHERE id = ?',
      [resetCode, expiresAt, user.id]
    );

    console.log(`[RESET PASSWORD] Code sent via email to ${user.email} for user ${user.username}: ${resetCode}`);

    res.json({
      success: true,
      message: `Mã xác minh phục hồi mật khẩu đã được gửi tới hòm thư của bạn (${user.email})! Hãy kiểm tra hòm thư chính và thư rác (Spam).`,
      username: user.username,
      code: resetCode,
      etherealUrl
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: 'Lỗi xử lý yêu cầu quên mật khẩu' });
  }
});

// Reset Password Endpoint
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { usernameOrEmail, code, newPassword } = req.body;
    if (!usernameOrEmail || !code || !newPassword) {
      return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ thông tin đặt lại mật khẩu' });
    }

    const user = await dbGet('SELECT id, password_reset_code, password_reset_expires FROM users WHERE username = ? OR email = ?', [usernameOrEmail, usernameOrEmail]);
    if (!user) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản người dùng tương ứng' });
    }

    if (!user.password_reset_code || user.password_reset_code !== code.trim()) {
      return res.status(400).json({ error: 'Mã xác minh OTP không chính xác' });
    }

    // Check expiration
    if (new Date(user.password_reset_expires) < new Date()) {
      return res.status(400).json({ error: 'Mã xác minh OTP của bạn đã hết hạn' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải dài tối thiểu 6 ký tự' });
    }

    const hashedNew = hashPassword(newPassword);
    await dbRun(
      'UPDATE users SET password_hash = ?, password_reset_code = NULL, password_reset_expires = NULL WHERE id = ?',
      [hashedNew, user.id]
    );

    res.json({
      success: true,
      message: 'Đặt lại mật khẩu mới thành công! Bạn hiện có thể đăng nhập bằng mật khẩu mới này.'
    });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: 'Không thể đặt lại mật khẩu do lỗi máy chủ' });
  }
});

// Get self infomation
app.get('/api/auth/me', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const user = await dbGet('SELECT id, username, avatar, status, two_factor_enabled, role, google_id, email FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    }
    res.json({
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      status: user.status,
      twoFactorEnabled: user.two_factor_enabled === 1,
      role: user.role || 'user',
      googleId: user.google_id || null,
      email: user.email || null
    });
  } catch (error) {
    console.error("Session fetch error:", error);
    res.status(500).json({ error: 'Lỗi tải phiên làm việc' });
  }
});

// Update profile status & avatar
app.post('/api/auth/profile', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const { status, avatar } = req.body;
    await dbRun('UPDATE users SET status = COALESCE(?, status), avatar = COALESCE(?, avatar) WHERE id = ?', [status, avatar, req.user.id]);
    res.json({ success: true, message: 'Cập nhật hồ sơ tài khoản thành công!' });
  } catch (e) {
    console.error("Update profile error:", e);
    res.status(500).json({ error: 'Chỉnh sửa thông tin thất bại' });
  }
});

// Update password
app.post('/api/auth/change-password', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Vui lòng cung cấp mật khẩu hiện tại và mật khẩu mới đầy đủ' });
    }
    const user = await dbGet('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản người dùng' });
    }
    const hashedCurrent = hashPassword(currentPassword);
    if (hashedCurrent !== user.password_hash) {
      return res.status(400).json({ error: 'Mật khẩu hiện tại không chính xác' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải dài tối thiểu 6 ký tự' });
    }
    const hashedNew = hashPassword(newPassword);
    await dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [hashedNew, req.user.id]);
    res.json({ success: true, message: 'Thay đổi mật khẩu tài khoản thành công!' });
  } catch (err) {
    console.error("Change password endpoint exception:", err);
    res.status(500).json({ error: 'Lỗi đồng bộ đổi mật khẩu máy chủ' });
  }
});

// Step 1: Generate 2FA Secret Key
app.post('/api/auth/2fa/generate', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const secret = generateBase32Secret();
    // Temporary persist/update on user but DO NOT mark enabled=1 until verified
    await dbRun('UPDATE users SET two_factor_secret = ? WHERE id = ?', [secret, req.user.id]);
    res.json({
      secret,
      qrContent: `otpauth://totp/ZNet:${req.user.username}?secret=${secret}&issuer=ZNet`
    });
  } catch (e) {
    console.error("Generate 2FA error:", e);
    res.status(500).json({ error: 'Không thể tạo mã bí mật 2FA' });
  }
});

// Step 2: Verify TOTP and fully activate 2FA
app.post('/api/auth/2fa/verify', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const { otp } = req.body;
    if (!otp) {
      return res.status(400).json({ error: 'Vui lòng cung cấp mã OTP 2FA cần xác thực' });
    }
    const user = await dbGet('SELECT two_factor_secret FROM users WHERE id = ?', [req.user.id]);
    if (!user || !user.two_factor_secret) {
      return res.status(400).json({ error: 'Chưa khởi tạo khoá bí mật 2FA' });
    }

    const isValid = verifyTOTP(user.two_factor_secret, otp);
    if (!isValid) {
      return res.status(400).json({ error: 'Mã OTP xác thực không đúng. Hãy kiểm tra lại ứng dụng thiết bị của bạn!' });
    }

    await dbRun('UPDATE users SET two_factor_enabled = 1 WHERE id = ?', [req.user.id]);
    res.json({ success: true, message: 'Đã kích hoạt bảo mật 2 lớp Authenticator 2FA thành công!' });
  } catch (e) {
    console.error("Verify 2FA error:", e);
    res.status(500).json({ error: 'Xác thực 2FA thất bại' });
  }
});

// Deactivate 2FA
app.post('/api/auth/2fa/disable', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const { otp } = req.body;
    const user = await dbGet('SELECT two_factor_secret, two_factor_enabled FROM users WHERE id = ?', [req.user.id]);
    if (!user || user.two_factor_enabled !== 1) {
      return res.status(400).json({ error: 'Bạn chưa kích hoạt bảo mật 2FA' });
    }

    const isValid = verifyTOTP(user.two_factor_secret, otp);
    if (!isValid) {
      return res.status(400).json({ error: 'Mã xác thực OTP không đúng. Yêu cầu mã trước khi tắt bảo mật!' });
    }

    await dbRun('UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL WHERE id = ?', [req.user.id]);
    res.json({ success: true, message: 'Đã huỷ kích hoạt bảo mật 2FA!' });
  } catch (e) {
    console.error("Disable 2FA error:", e);
    res.status(500).json({ error: 'Sinh lỗi trong quá trình huỷ 2FA' });
  }
});

// Search potential friends
app.get('/api/friends/search', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const query = req.query.q ? `%${req.query.q}%` : '%';
    const currentUserId = req.user.id;

    // Retrieve all users matching the search query except current user
    const listUsers = await dbAll(
      `SELECT u.id, u.username, u.avatar, u.status,
       (SELECT status FROM friends WHERE (user_id = ? AND friend_id = u.id) OR (user_id = u.id AND friend_id = ?)) as relationship_status,
       (SELECT user_id FROM friends WHERE (user_id = ? AND friend_id = u.id) OR (user_id = u.id AND friend_id = ?)) as request_initiator
       FROM users u 
       WHERE u.username LIKE ? AND u.id != ?
       LIMIT 40`,
      [currentUserId, currentUserId, currentUserId, currentUserId, query, currentUserId]
    );

    res.json(listUsers);
  } catch (e) {
    console.error("Search friends error:", e);
    res.status(500).json({ error: 'Không thể tìm kiếm danh sách người dùng' });
  }
});

// Add friend request
app.post('/api/friends/request', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const { friendId } = req.body;
    const currentUserId = req.user.id;

    if (!friendId || friendId === currentUserId) {
      return res.status(400).json({ error: 'Địa chỉ bạn bè gửi yêu cầu không hợp lệ' });
    }

    // Check existing mapping
    const existing = await dbGet(
      'SELECT id, status FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
      [currentUserId, friendId, friendId, currentUserId]
    );

    if (existing) {
      return res.status(400).json({ error: `Trạng thái kết bạn đã tồn tại (${existing.status})` });
    }

    await dbRun(
      'INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)',
      [currentUserId, friendId, 'pending']
    );

    res.json({ success: true, message: 'Đã gửi lời mời kết bạn!' });
  } catch (error) {
    console.error("Friend request registration failed:", error);
    res.status(500).json({ error: 'Gửi yêu cầu dũ kết bạn thất bại' });
  }
});

// Respond to friend request (accept/decline)
app.post('/api/friends/respond', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const { friendId, action } = req.body; // action: 'accept' or 'decline'
    const currentUserId = req.user.id;

    if (!friendId || !['accept', 'decline'].includes(action)) {
      return res.status(400).json({ error: 'Yêu cầu kết bạn hành động không hợp lệ' });
    }

    if (action === 'accept') {
      await dbRun(
        `UPDATE friends SET status = 'accepted' 
         WHERE (user_id = ? AND friend_id = ? AND status = 'pending') 
            OR (user_id = ? AND friend_id = ? AND status = 'pending')`,
        [friendId, currentUserId, currentUserId, friendId]
      );
      res.json({ success: true, message: 'Đã đồng ý đồng ý lời kết bạn, sẵn sàng nhắn tin!' });
    } else {
      await dbRun(
        `DELETE FROM friends 
         WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)) AND status = 'pending'`,
        [friendId, currentUserId, currentUserId, friendId]
      );
      res.json({ success: true, message: 'Đã huỷ bỏ lời mời kết bạn' });
    }
  } catch (error) {
    console.error("Response to friend request error:", error);
    res.status(500).json({ error: 'Thực hiện phản hồi thất bại' });
  }
});

// List user friends and requests
app.get('/api/friends/list', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const currentUserId = req.user.id;

    // Get existing friends
    const friendsList = await dbAll(
      `SELECT u.id, u.username, u.avatar, u.status, f.status as relation
       FROM friends f
       JOIN users u ON (f.user_id = u.id OR f.friend_id = u.id)
       WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted' AND u.id != ?`,
      [currentUserId, currentUserId, currentUserId]
    );

    // Get pending received requests
    const incomingRequests = await dbAll(
      `SELECT u.id, u.username, u.avatar, u.status
       FROM friends f
       JOIN users u ON f.user_id = u.id
       WHERE f.friend_id = ? AND f.status = 'pending'`,
      [currentUserId]
    );

    // Get pending sent requests
    const outgoingRequests = await dbAll(
      `SELECT u.id, u.username, u.avatar, u.status
       FROM friends f
       JOIN users u ON f.friend_id = u.id
       WHERE f.user_id = ? AND f.status = 'pending'`,
      [currentUserId]
    );

    res.json({
      friends: friendsList,
      incoming: incomingRequests,
      outgoing: outgoingRequests
    });
  } catch (error) {
    console.error("List friends error:", error);
    res.status(500).json({ error: 'Không thể lấy dữ liệu danh sách kết bạn' });
  }
});

// Message history between user and friends
app.get('/api/messages/history/:friendId', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const friendId = parseInt(req.params.friendId);
    const currentUserId = req.user.id;

    if (isNaN(friendId)) {
      return res.status(400).json({ error: 'Mã bạn bè không hợp lệ' });
    }

    const messages = await dbAll(
      `SELECT m.id, m.sender_id as senderId, m.receiver_id as receiverId, m.message_text as text, m.created_at as createdAt, m.read_status as readStatus, m.is_recalled as isRecalled
       FROM messages m
       WHERE ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
         AND NOT (m.sender_id = ? AND m.deleted_by_sender = 1)
         AND NOT (m.receiver_id = ? AND m.deleted_by_receiver = 1)
       ORDER BY m.created_at ASC
       LIMIT 150`,
      [currentUserId, friendId, friendId, currentUserId, currentUserId, currentUserId]
    );

    // Mark messages from friend to me as read
    await dbRun(
      'UPDATE messages SET read_status = 1 WHERE sender_id = ? AND receiver_id = ? AND read_status = 0',
      [friendId, currentUserId]
    );

    res.json(messages);
  } catch (e) {
    console.error("Fetch message history failed:", e);
    res.status(500).json({ error: 'Lỗi đồng bộ lịch sử tin nhắn' });
  }
});

// HTTP API fallback to send private messages
app.post('/api/messages/send', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const { receiverId, text } = req.body;
    const currentUserId = req.user.id;

    if (!receiverId || !text || text.trim() === '') {
      return res.status(400).json({ error: 'Nội dung tin nhắn không hợp lệ' });
    }

    const rId = parseInt(receiverId);
    if (isNaN(rId)) {
      return res.status(400).json({ error: 'Mã người nhận không hợp lệ' });
    }

    // Insert secure message to SQLite DB
    const result = await dbRun(
      'INSERT INTO messages (sender_id, receiver_id, message_text) VALUES (?, ?, ?)',
      [currentUserId, rId, text.trim()]
    );

    const timeStr = new Date().toISOString();

    const responsePayload = {
      id: result.id,
      senderId: currentUserId,
      receiverId: rId,
      text: text.trim(),
      createdAt: timeStr,
      readStatus: 0,
      isRecalled: 0
    };

    // Attempt to broadcast to active WebSockets if open
    const wsPayload = JSON.stringify({
      type: 'message_recv',
      id: result.id,
      senderId: currentUserId,
      text: text.trim(),
      createdAt: timeStr
    });

    const destinationSocket = activeSockets.get(rId);
    if (destinationSocket && destinationSocket.readyState === WebSocket.OPEN) {
      try {
        destinationSocket.send(wsPayload);
      } catch (wsErr) {
        console.error("HTTP broadcast failed on destination WS:", wsErr);
      }
    }

    // Also send an acknowledgment to sender's socket if open
    const senderSocket = activeSockets.get(currentUserId);
    if (senderSocket && senderSocket.readyState === WebSocket.OPEN) {
      try {
        senderSocket.send(JSON.stringify({
          type: 'message_ack',
          id: result.id,
          receiverId: rId,
          text: text.trim(),
          createdAt: timeStr
        }));
      } catch (wsErr) {
        console.error("HTTP broadcast failed on sender WS:", wsErr);
      }
    }

    res.json(responsePayload);
  } catch (error) {
    console.error("HTTP send message failed:", error);
    res.status(500).json({ error: 'Không thể gửi tin nhắn qua máy chủ' });
  }
});

// Feeds: timeline list
app.get('/api/feeds/list', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const currentUserId = req.user.id;
    const feedPosts = await dbAll(
      `SELECT f.id, f.content, f.likes_count as likesCount, f.created_at as createdAt,
              u.username, u.avatar, u.id as userId,
              (SELECT COUNT(*) FROM feed_likes WHERE feed_id = f.id AND user_id = ?) as hasLiked,
              (SELECT COUNT(*) FROM comments WHERE feed_id = f.id) as commentsCount
       FROM feeds f
       JOIN users u ON f.user_id = u.id
       ORDER BY f.created_at DESC
       LIMIT 50`,
      [currentUserId]
    );
    res.json(feedPosts);
  } catch (error) {
    console.error("Get state feed posts failed:", error);
    res.status(500).json({ error: 'Tải vòng thời gian của ZNet thất bại' });
  }
});

// Feeds: create status post
app.post('/api/feeds/create', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const { content } = req.body;
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Nội dung chia sẻ trạng thái không thể bỏ trống' });
    }

    const result = await dbRun(
      'INSERT INTO feeds (user_id, content) VALUES (?, ?)',
      [req.user.id, content]
    );

    const fullPost = await dbGet(
      `SELECT f.id, f.content, f.likes_count as likesCount, f.created_at as createdAt,
              u.username, u.avatar, u.id as userId,
              0 as hasLiked,
              0 as commentsCount
       FROM feeds f
       JOIN users u ON f.user_id = u.id
       WHERE f.id = ?`,
      [result.id]
    );

    res.json(fullPost);
  } catch (error) {
    console.error("Insert message into feed failed:", error);
    res.status(500).json({ error: 'Đăng trạng thái thất bại' });
  }
});

// Feeds: like/unlike post toggle
app.post('/api/feeds/like/:feedId', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const feedId = parseInt(req.params.feedId);
    const currentUserId = req.user.id;
    
    if (isNaN(feedId)) {
      return res.status(400).json({ error: 'Mã bài viết không hợp lệ' });
    }

    // Check if liked before
    const liked = await dbGet('SELECT id FROM feed_likes WHERE feed_id = ? AND user_id = ?', [feedId, currentUserId]);
    
    if (liked) {
      // Unlike
      await dbRun('DELETE FROM feed_likes WHERE feed_id = ? AND user_id = ?', [feedId, currentUserId]);
      await dbRun('UPDATE feeds SET likes_count = MAX(0, likes_count - 1) WHERE id = ?', [feedId]);
    } else {
      // Like
      await dbRun('INSERT INTO feed_likes (feed_id, user_id) VALUES (?, ?)', [feedId, currentUserId]);
      await dbRun('UPDATE feeds SET likes_count = likes_count + 1 WHERE id = ?', [feedId]);
    }

    const updated = await dbGet(
      `SELECT likes_count as likesCount,
              (SELECT COUNT(*) FROM feed_likes WHERE feed_id = ? AND user_id = ?) as hasLiked
       FROM feeds WHERE id = ?`,
      [feedId, currentUserId, feedId]
    );
    res.json(updated);
  } catch (e) {
    console.error("Liking toggle failed:", e);
    res.status(500).json({ error: 'Lỗi xử lý lượt thích bài đăng!' });
  }
});

// Comments: Get all comments for a post
app.get('/api/feeds/comments/:feedId', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const feedId = parseInt(req.params.feedId);
    if (isNaN(feedId)) {
      return res.status(400).json({ error: 'Mã bài viết không hợp lệ' });
    }

    const comments = await dbAll(
      `SELECT c.id, c.content, c.created_at as createdAt,
              u.id as userId, u.username, u.avatar
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.feed_id = ?
       ORDER BY c.created_at ASC`,
      [feedId]
    );
    res.json(comments);
  } catch (err) {
    console.error("Get comments failed:", err);
    res.status(500).json({ error: 'Không thể tải danh sách bình luận' });
  }
});

// Comments: Add a new comment
app.post('/api/feeds/comments/:feedId', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const feedId = parseInt(req.params.feedId);
    const { content } = req.body;
    const currentUserId = req.user.id;

    if (isNaN(feedId)) {
      return res.status(400).json({ error: 'Mã bài viết không hợp lệ' });
    }
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Nội dung bình luận không thể bỏ trống' });
    }

    const result = await dbRun(
      'INSERT INTO comments (feed_id, user_id, content) VALUES (?, ?, ?)',
      [feedId, currentUserId, content]
    );

    const newComment = await dbGet(
      `SELECT c.id, c.content, c.created_at as createdAt,
              u.id as userId, u.username, u.avatar
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.id = ?`,
      [result.id]
    );

    res.json(newComment);
  } catch (err) {
    console.error("Add comment failed:", err);
    res.status(500).json({ error: 'Không thể gửi bình luận' });
  }
});

// Friend manipulation: Unfriend or cancel requests
app.post('/api/friends/unfriend', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const { friendId } = req.body;
    const currentUserId = req.user.id;
    if (!friendId) {
      return res.status(400).json({ error: 'Mã thành viên không hợp lệ' });
    }
    await dbRun(
      'DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
      [currentUserId, friendId, friendId, currentUserId]
    );
    res.json({ success: true, message: 'Đã xóa kết bạn hoặc hủy yêu cầu thành công.' });
  } catch (err) {
    console.error("Unfriend/cancel failed:", err);
    res.status(500).json({ error: 'Lỗi xử lý dọn dẹp liên kết kết bạn' });
  }
});

// Settings: Get auto delete configuration
app.get('/api/settings/auto-delete', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const user = await dbGet('SELECT auto_delete_pms, auto_delete_groups FROM users WHERE id = ?', [req.user.id]);
    res.json({
      autoDeletePms: user?.auto_delete_pms === 1,
      autoDeleteGroups: user?.auto_delete_groups === 1
    });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tải mục bảo mật dọn dẹp' });
  }
});

// Settings: Update auto delete configuration
app.post('/api/settings/auto-delete', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const { autoDeletePms, autoDeleteGroups } = req.body;
    await dbRun(
      'UPDATE users SET auto_delete_pms = ?, auto_delete_groups = ? WHERE id = ?',
      [autoDeletePms ? 1 : 0, autoDeleteGroups ? 1 : 0, req.user.id]
    );
    res.json({ success: true, message: 'Đã lưu thiết lập tự động dọn dẹp tin nhắn!' });
  } catch (err) {
    res.status(500).json({ error: 'Không thể lưu thiết lập dọn dẹp' });
  }
});

// Groups: Create a new group chat
app.post('/api/groups/create', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const { name, memberIds, isPrivate } = req.body; // memberIds: array of numbers (friend user IDs)
    const currentUserId = req.user.id;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Tên nhóm không thể để trống' });
    }

    const isPrivateVal = isPrivate ? 1 : 0;
    const result = await dbRun('INSERT INTO chat_groups (name, is_private, creator_id) VALUES (?, ?, ?)', [name.trim(), isPrivateVal, currentUserId]);
    const groupId = result.id;

    // Insert creator
    await dbRun('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)', [groupId, currentUserId]);

    // Insert other memberIds
    if (Array.isArray(memberIds)) {
      for (const id of memberIds) {
        const uId = parseInt(id);
        if (!isNaN(uId) && uId !== currentUserId) {
          try {
            await dbRun('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', [groupId, uId]);
          } catch (_) {
            // Ignore duplicates
          }
        }
      }
    }

    res.json({ success: true, groupId, name, isPrivate: isPrivateVal, creatorId: currentUserId });
  } catch (err) {
    console.error("Create group failed:", err);
    res.status(500).json({ error: 'Lỗi tạo nhóm trò chuyện mới' });
  }
});

// Groups: List groups current user is in
app.get('/api/groups/list', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const currentUserId = req.user.id;
    const groups = await dbAll(
      `SELECT g.id, g.name, g.created_at as createdAt, g.is_private as isPrivate, g.creator_id as creatorId,
              (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as membersCount
       FROM chat_groups g
       JOIN group_members m ON g.id = m.group_id
       WHERE m.user_id = ?
       ORDER BY g.id DESC`,
      [currentUserId]
    );
    res.json(groups);
  } catch (err) {
    console.error("Fetch groups list failed:", err);
    res.status(500).json({ error: 'Không tải được danh sách nhóm chat' });
  }
});

// Groups: Add new members on existing group
app.post('/api/groups/add-member', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const { groupId, memberId } = req.body;
    const currentUserId = req.user.id;

    // Validate that current user is member of the group
    const membership = await dbGet('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, currentUserId]);
    if (!membership) {
      return res.status(403).json({ error: 'Bạn không có quyền quản lý nhóm trò chuyện này' });
    }

    await dbRun('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', [groupId, memberId]);
    res.json({ success: true, message: 'Thêm thành viên thành công' });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi thêm thành viên vào nhóm' });
  }
});

// Groups: Get group messages history
app.get('/api/groups/:groupId/messages', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const currentUserId = req.user.id;

    if (isNaN(groupId)) {
      return res.status(400).json({ error: 'Mã nhóm không hợp lệ' });
    }

    // Verify current user is member
    const membership = await dbGet('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, currentUserId]);
    if (!membership) {
      return res.status(403).json({ error: 'Bạn không phải là thành viên nhóm trò chuyện này' });
    }

    const messages = await dbAll(
      `SELECT gm.id, gm.sender_id as senderId, gm.message_text as text, gm.created_at as createdAt,
              u.username as senderName, u.avatar as senderAvatar, gm.is_recalled as isRecalled, gm.deleted_by_users as deletedByUsers
       FROM group_messages gm
       JOIN users u ON gm.sender_id = u.id
       WHERE gm.group_id = ?
         AND (gm.deleted_by_users IS NULL OR gm.deleted_by_users NOT LIKE ?)
       ORDER BY gm.created_at ASC
       LIMIT 100`,
      [groupId, `%,${currentUserId},%`]
    );

    res.json(messages);
  } catch (err) {
    console.error("Get group messages failed:", err);
    res.status(500).json({ error: 'Không thể tải lịch sử tin nhắn nhóm' });
  }
});

// HTTP API fallback to send group messages
app.post('/api/groups/messages/send', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const { groupId, text } = req.body;
    const currentUserId = req.user.id;

    if (!groupId || !text || text.trim() === '') {
      return res.status(400).json({ error: 'Nội dung tin nhắn không hợp lệ' });
    }

    const gIdNum = parseInt(groupId);
    if (isNaN(gIdNum)) {
      return res.status(400).json({ error: 'Mã nhóm không hợp lệ' });
    }

    // Verify user is in group
    const isMember = await dbGet('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?', [gIdNum, currentUserId]);
    if (!isMember) {
      return res.status(403).json({ error: 'Bạn không thuộc nhóm chat này' });
    }

    // Insert group message
    const result = await dbRun(
      'INSERT INTO group_messages (group_id, sender_id, message_text) VALUES (?, ?, ?)',
      [gIdNum, currentUserId, text.trim()]
    );

    const timeStr = new Date().toISOString();

    // Fetch sender details
    const sender = await dbGet('SELECT username, avatar FROM users WHERE id = ?', [currentUserId]);

    const responsePayload = {
      id: result.id,
      senderId: currentUserId,
      text: text.trim(),
      createdAt: timeStr,
      senderName: sender?.username || 'User',
      senderAvatar: sender?.avatar || '',
      isRecalled: 0
    };

    // Broadcast to everyone in the group
    const members = await dbAll('SELECT user_id FROM group_members WHERE group_id = ?', [gIdNum]);
    const wsPayload = JSON.stringify({
      type: 'group_message_recv',
      id: result.id,
      groupId: gIdNum,
      senderId: currentUserId,
      senderName: sender?.username || 'User',
      senderAvatar: sender?.avatar || '',
      text: text.trim(),
      createdAt: timeStr
    });

    members.forEach((memb: any) => {
      const memberSocket = activeSockets.get(memb.user_id);
      if (memberSocket && memberSocket.readyState === WebSocket.OPEN) {
        try {
          memberSocket.send(wsPayload);
        } catch (wsErr) {
          console.error("HTTP group broadcast failed on member socket:", wsErr);
        }
      }
    });

    res.json(responsePayload);
  } catch (err) {
    console.error("HTTP send group message error:", err);
    res.status(500).json({ error: 'Không thể gửi tin nhắn nhóm qua máy chủ' });
  }
});

// Groups: Get group members with roles (creator vs member)
app.get('/api/groups/:groupId/members', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const currentUserId = req.user.id;

    if (isNaN(groupId)) {
      return res.status(400).json({ error: 'Mã nhóm không hợp lệ' });
    }

    // Verify current user is a member or creator of the group
    const group = await dbGet('SELECT creator_id FROM chat_groups WHERE id = ?', [groupId]);
    if (!group) {
      return res.status(404).json({ error: 'Không tìm thấy nhóm này' });
    }

    const membership = await dbGet('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, currentUserId]);
    if (!membership && group.creator_id !== currentUserId) {
      return res.status(403).json({ error: 'Bạn không phải là thành viên nhóm trò chuyện này' });
    }

    // Select group members along with user details
    const members = await dbAll(
      `SELECT u.id, u.username, u.avatar, u.status, u.is_online as isOnline,
              CASE WHEN u.id = ? THEN 'owner' ELSE 'member' END as role
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = ?`,
      [group.creator_id, groupId]
    );

    res.json(members);
  } catch (err) {
    console.error("Get group members failed:", err);
    res.status(500).json({ error: 'Không thể tải danh sách thành viên nhóm' });
  }
});

// Groups: Join group (Direct for public, pending request for private)
app.post('/api/groups/join', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const { groupIdOrLink } = req.body;
    const currentUserId = req.user.id;

    if (!groupIdOrLink) {
      return res.status(400).json({ error: 'Không tìm thấy thông tin nhóm tương ứng' });
    }

    // Extract groupId if a full URL/link is pasted
    let groupId = parseInt(groupIdOrLink);
    if (isNaN(groupId)) {
      const match = String(groupIdOrLink).match(/\/join-group\/(\d+)/) || String(groupIdOrLink).match(/group-(\d+)/);
      if (match) {
        groupId = parseInt(match[1]);
      }
    }

    if (isNaN(groupId)) {
      return res.status(400).json({ error: 'Mã liên kết mời tham gia nhóm không hợp lệ' });
    }

    // Find group details
    const group = await dbGet('SELECT * FROM chat_groups WHERE id = ?', [groupId]);
    if (!group) {
      return res.status(404).json({ error: 'Không tìm thấy nhóm trò chuyện này trong hệ thống' });
    }

    // Check if already is member
    const isMember = await dbGet('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, currentUserId]);
    if (isMember) {
      return res.json({ success: true, joined: true, groupId, message: 'Bạn đang là thành viên của nhóm trò chuyện này!' });
    }

    const isGroupPrivate = group.is_private === 1;

    if (!isGroupPrivate) {
      // Public group -> insert directly
      await dbRun('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', [groupId, currentUserId]);
      return res.json({ success: true, joined: true, groupId, message: 'Tham gia nhóm công khai thành công!' });
    } else {
      // Private group -> create pending request to admin/creator
      const existingReq = await dbGet('SELECT status FROM group_requests WHERE group_id = ? AND user_id = ?', [groupId, currentUserId]);
      if (existingReq) {
        if (existingReq.status === 'pending') {
          return res.json({ success: true, joined: false, pending: true, message: 'Yêu cầu tham gia của bạn đang chờ phê duyệt từ chủ nhóm.' });
        } else if (existingReq.status === 'accepted') {
          await dbRun('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', [groupId, currentUserId]);
          return res.json({ success: true, joined: true, groupId, message: 'Chào mừng trở lại! Bạn đã được phê duyệt làm thành viên.' });
        } else {
          return res.status(400).json({ error: 'Yêu cầu tham gia nhóm của bạn đã bị từ chối bởi quản trị viên.' });
        }
      }

      await dbRun('INSERT INTO group_requests (group_id, user_id, status) VALUES (?, ?, ?)', [groupId, currentUserId, 'pending']);
      return res.json({ success: true, joined: false, pending: true, message: 'Yêu cầu tham gia nhóm riêng tư đã gửi! Vui lòng đợi chủ nhóm phê duyệt.' });
    }
  } catch (err) {
    console.error("Join group error:", err);
    res.status(500).json({ error: 'Gặp sự cố khi thực hiện tham gia nhóm' });
  }
});

// Groups: Leave group
app.post('/api/groups/:groupId/leave', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const currentUserId = req.user.id;
    if (isNaN(groupId)) {
      return res.status(400).json({ error: 'Mã nhóm không hợp lệ' });
    }

    // Verify membership
    const membership = await dbGet('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, currentUserId]);
    if (!membership) {
      return res.status(400).json({ error: 'Bạn không phải là thành viên của nhóm này' });
    }

    // Delete group member
    await dbRun('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, currentUserId]);
    
    // Optional: Clean up associated pending requests so that the user can join again later if needed
    await dbRun('DELETE FROM group_requests WHERE group_id = ? AND user_id = ?', [groupId, currentUserId]);

    res.json({ success: true, message: 'Bạn đã rời nhóm thành công' });
  } catch (err) {
    console.error("Leave group error:", err);
    res.status(500).json({ error: 'Lỗi ngoài ý muốn khi rời nhóm' });
  }
});

// Firebase Backup Sync API endpoint
app.get('/api/firebase/sync-data', authenticateAdminMiddleware, async (req: any, res) => {
  try {
    const users = await dbAll('SELECT id, username, avatar, status FROM users');
    const feeds = await dbAll(`
      SELECT f.id, f.content, f.likes_count as likesCount, f.created_at as createdAt,
             u.username, u.avatar, f.user_id as userId
      FROM feeds f
      JOIN users u ON f.user_id = u.id
    `);
    const messages = await dbAll('SELECT id, sender_id as senderId, receiver_id as receiverId, message_text as text, created_at as createdAt, is_recalled as isRecalled FROM messages');
    const groups = await dbAll(`
      SELECT id, name, created_at as createdAt, creator_id as creatorId,
             (SELECT COUNT(*) FROM group_members WHERE group_id = chat_groups.id) as membersCount
      FROM chat_groups
    `);
    const groupMessages = await dbAll(`
      SELECT gm.id, gm.group_id as groupId, gm.sender_id as senderId, gm.message_text as text, gm.created_at as createdAt,
             u.username as senderName, u.avatar as senderAvatar, gm.is_recalled as isRecalled
      FROM group_messages gm
      JOIN users u ON gm.sender_id = u.id
    `);

    res.json({
      users,
      feeds,
      messages,
      groups,
      groupMessages
    });
  } catch (err) {
    console.error("Firebase sync-data endpoint failed:", err);
    res.status(500).json({ error: 'Không thể lấy dữ liệu để đồng bộ hóa lên Firebase Cloud' });
  }
});

// Groups: List pending join requests (only for creators or master admin)
app.get('/api/groups/:groupId/requests', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const currentUserId = req.user.id;

    if (isNaN(groupId)) {
      return res.status(400).json({ error: 'Mã nhóm không hợp lệ' });
    }

    const group = await dbGet('SELECT creator_id FROM chat_groups WHERE id = ?', [groupId]);
    if (!group) {
      return res.status(404).json({ error: 'Không tìm thấy nhóm tương ứng' });
    }

    const isCreator = group.creator_id === currentUserId;
    const isAdmin = req.user.role === 'admin';

    if (!isCreator && !isAdmin) {
      return res.status(403).json({ error: 'Bạn không phải chủ nhóm hoặc admin để xem yêu cầu phê duyệt này.' });
    }

    const requests = await dbAll(
      `SELECT r.id, r.group_id as groupId, r.user_id as userId, r.status, r.created_at as createdAt,
              u.username, u.avatar, u.status as userStatus
       FROM group_requests r
       JOIN users u ON r.user_id = u.id
       WHERE r.group_id = ? AND r.status = 'pending'
       ORDER BY r.created_at DESC`,
      [groupId]
    );

    res.json(requests);
  } catch (err) {
    console.error("Fetch group requests failed:", err);
    res.status(500).json({ error: 'Không tải được danh sách yêu cầu' });
  }
});

// Groups: Approve request join groups
app.post('/api/groups/:groupId/requests/:requestId/approve', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const requestId = parseInt(req.params.requestId);
    const currentUserId = req.user.id;

    const group = await dbGet('SELECT creator_id FROM chat_groups WHERE id = ?', [groupId]);
    if (!group) return res.status(404).json({ error: 'Không tìm thấy nhóm' });

    const isCreator = group.creator_id === currentUserId;
    const isAdmin = req.user.role === 'admin';

    if (!isCreator && !isAdmin) {
      return res.status(403).json({ error: 'Bạn không có đặc quyền quản lý nhóm này' });
    }

    const request = await dbGet('SELECT * FROM group_requests WHERE id = ?', [requestId]);
    if (!request) return res.status(404).json({ error: 'Yêu cầu không khả dụng hoặc đã xử lý trước đó.' });

    // Update status and insert group member
    await dbRun("UPDATE group_requests SET status = 'accepted' WHERE id = ?", [requestId]);
    await dbRun("INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)", [groupId, request.user_id]);

    res.json({ success: true, message: 'Đã phê duyệt yêu cầu thành viên mới thành công!' });
  } catch (err) {
    res.status(500).json({ error: 'Thao tác phê duyệt thất bại.' });
  }
});

// Groups: Reject request join groups
app.post('/api/groups/:groupId/requests/:requestId/reject', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const requestId = parseInt(req.params.requestId);
    const currentUserId = req.user.id;

    const group = await dbGet('SELECT creator_id FROM chat_groups WHERE id = ?', [groupId]);
    if (!group) return res.status(404).json({ error: 'Không tìm thấy nhóm' });

    const isCreator = group.creator_id === currentUserId;
    const isAdmin = req.user.role === 'admin';

    if (!isCreator && !isAdmin) {
      return res.status(403).json({ error: 'Bạn không có quyền từ chối phê duyệt nhóm này' });
    }

    await dbRun("UPDATE group_requests SET status = 'rejected' WHERE id = ?", [requestId]);
    res.json({ success: true, message: 'Đã từ chối yêu cầu tham gia thành công.' });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi thao tác từ chối lời mời.' });
  }
});

// PM: Recall message (only sender and only within 5 minutes)
app.post('/api/messages/recall/:messageId', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const messageId = parseInt(req.params.messageId);
    const currentUserId = req.user.id;

    const msg = await dbGet('SELECT * FROM messages WHERE id = ?', [messageId]);
    if (!msg) {
      return res.status(404).json({ error: 'Không tìm thấy tin nhắn này.' });
    }

    if (msg.sender_id !== currentUserId) {
      return res.status(403).json({ error: 'Bạn chỉ có quyền thu hồi tin nhắn của chính mình!' });
    }

    // Verify 5-minutes lease window
    const durationMs = new Date().getTime() - new Date(msg.created_at).getTime();
    if (durationMs > 5 * 60 * 1000) {
      return res.status(400).json({ error: 'Đã quá thời gian 5 phút. Không thể thu hồi tin nhắn này nữa!' });
    }

    await dbRun("UPDATE messages SET is_recalled = 1, message_text = 'Tin nhắn đã được thu hồi' WHERE id = ?", [messageId]);

    // Broadcast update dynamically via Live DB and Websocket integration
    const wsPayload = JSON.stringify({
      type: 'message_recall_recv',
      id: messageId,
      senderId: msg.sender_id,
      receiverId: msg.receiver_id
    });

    const actorSocket = activeSockets.get(msg.sender_id);
    if (actorSocket && actorSocket.readyState === WebSocket.OPEN) {
      actorSocket.send(wsPayload);
    }
    const destinationSocket = activeSockets.get(msg.receiver_id);
    if (destinationSocket && destinationSocket.readyState === WebSocket.OPEN) {
      destinationSocket.send(wsPayload);
    }

    res.json({ success: true, message: 'Thu hồi tin nhắn thành công.' });
  } catch (err) {
    console.error("Recall PM failed:", err);
    res.status(500).json({ error: 'Lỗi đồng bộ thu hồi nhắn tin' });
  }
});

// PM: Delete side (only hides for requester)
app.post('/api/messages/delete-side/:messageId', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const messageId = parseInt(req.params.messageId);
    const currentUserId = req.user.id;

    const msg = await dbGet('SELECT * FROM messages WHERE id = ?', [messageId]);
    if (!msg) {
      return res.status(404).json({ error: 'Không tìm thấy tin nhắn tương ứng' });
    }

    if (msg.sender_id === currentUserId) {
      await dbRun('UPDATE messages SET deleted_by_sender = 1 WHERE id = ?', [messageId]);
    } else if (msg.receiver_id === currentUserId) {
      await dbRun('UPDATE messages SET deleted_by_receiver = 1 WHERE id = ?', [messageId]);
    } else {
      return res.status(403).json({ error: 'Bạn không có quyền quản lý dòng tin này.' });
    }

    res.json({ success: true, message: 'Đã xóa tin nhắn thành công phía bên bạn.' });
  } catch (err) {
    res.status(500).json({ error: 'Gặp lỗi dọn tin nhắn cục bộ.' });
  }
});

// Group Message: Recall message (within 5 minutes, only sender)
app.post('/api/groups/messages/recall/:messageId', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const messageId = parseInt(req.params.messageId);
    const currentUserId = req.user.id;

    const msg = await dbGet('SELECT * FROM group_messages WHERE id = ?', [messageId]);
    if (!msg) {
      return res.status(404).json({ error: 'Không tìm thấy tin nhắn nhóm này.' });
    }

    if (msg.sender_id !== currentUserId) {
      return res.status(403).json({ error: 'Bạn chỉ có quyền thu hồi tin nhắn do chính bạn gửi!' });
    }

    const durationMs = new Date().getTime() - new Date(msg.created_at).getTime();
    if (durationMs > 5 * 60 * 1000) {
      return res.status(400).json({ error: 'Đã quá thời gian 5 phút. Không thể thu hồi tin nhắn này!' });
    }

    await dbRun("UPDATE group_messages SET is_recalled = 1, message_text = 'Tin nhắn đã được thu hồi' WHERE id = ?", [messageId]);

    // Broadcast across group members online
    const members = await dbAll('SELECT user_id FROM group_members WHERE group_id = ?', [msg.group_id]);
    const wsPayload = JSON.stringify({
      type: 'group_message_recall_recv',
      id: messageId,
      groupId: msg.group_id
    });

    members.forEach((memb: any) => {
      const sock = activeSockets.get(memb.user_id);
      if (sock && sock.readyState === WebSocket.OPEN) {
        sock.send(wsPayload);
      }
    });

    res.json({ success: true, message: 'Thu hồi tin nhắn nhóm thành công.' });
  } catch (err) {
    console.error("Recall group message error:", err);
    res.status(500).json({ error: 'Không thể xử lý thu hồi tin nhắn nhóm.' });
  }
});

// Group Message: Delete side
app.post('/api/groups/messages/delete-side/:messageId', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const messageId = parseInt(req.params.messageId);
    const currentUserId = req.user.id;

    const msg = await dbGet('SELECT * FROM group_messages WHERE id = ?', [messageId]);
    if (!msg) {
      return res.status(404).json({ error: 'Không tìm thấy tin nhắn nhóm.' });
    }

    let usersDeleted = msg.deleted_by_users || '';
    if (!usersDeleted.includes(`,${currentUserId},`)) {
      usersDeleted = usersDeleted + `,${currentUserId},`;
      await dbRun('UPDATE group_messages SET deleted_by_users = ? WHERE id = ?', [usersDeleted, messageId]);
    }

    res.json({ success: true, message: 'Đã dọn dẹp tin nhắn khỏi hòm thư nhóm của bạn.' });
  } catch (err) {
    res.status(500).json({ error: 'Không thể xóa tin nhắn nhóm phía bạn.' });
  }
});

// Feeds: Delete own post
app.delete('/api/feeds/:feedId', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const feedId = parseInt(req.params.feedId);
    const currentUserId = req.user.id;

    if (isNaN(feedId)) {
      return res.status(400).json({ error: 'Mã bài đăng không hợp lệ' });
    }

    const post = await dbGet('SELECT * FROM feeds WHERE id = ?', [feedId]);
    if (!post) {
      return res.status(404).json({ error: 'Không tìm thấy bài viết này trong hệ thống.' });
    }

    const isMasterAdmin = req.user.role === 'admin';
    const isOwner = post.user_id === currentUserId;

    if (!isOwner && !isMasterAdmin) {
      return res.status(403).json({ error: 'Bạn không có thẩm quyền gỡ bỏ bài đăng của người dùng này.' });
    }

    // Cascade clear feeds data from SQLite to prevent database clutter
    await dbRun('DELETE FROM feeds WHERE id = ?', [feedId]);
    await dbRun('DELETE FROM comments WHERE feed_id = ?', [feedId]);
    await dbRun('DELETE FROM feed_likes WHERE feed_id = ?', [feedId]);

    res.json({ success: true, message: 'Gỡ bài đăng khỏi mạng xã hội ZNet thành công!' });
  } catch (err) {
    console.error("Delete feed error:", err);
    res.status(500).json({ error: 'Lỗi dọn dẹp bài đăng ZNet.' });
  }
});

// Google Docs: Export all codebase source files to a Google Document
app.post('/api/export/google-docs', authenticateAdminMiddleware, async (req: any, res) => {
  try {
    const { googleAccessToken } = req.body;
    if (!googleAccessToken) {
      return res.status(400).json({ error: 'Yêu cầu Google Access Token hợp lệ để thực hiện sao lưu mã nguồn.' });
    }

    const docTitle = `Mã nguồn dự án ZNet - ${new Date().toLocaleDateString('vi-VN')}`;

    let combinedText = `========================================================================
📁 DỰ ÁN: ZNET - MẠNG XÃ HỘI THỜI GIAN THỰC ĐẦY ĐỦ KHÔNG SAI SÓT
📅 THỜI GIAN ĐÓNG GÓI: ${new Date().toLocaleString('vi-VN')}
👤 NGƯỜI ĐÓNG GÓI: ${req.user.username} (ID: #${req.user.id})
========================================================================

DANH SÁCH TOÀN BỘ MÃ NGUỒN CÁC FILE CHÍNH CỦA DỰ ÁN ZNET:
`;

    const filesList = [
      'index.html',
      'package.json',
      'vite.config.ts',
      'tsconfig.json',
      'server.ts',
      'src/types.ts',
      'src/index.css',
      'src/main.tsx',
      'src/App.tsx',
      'src/components/ChatWindow.tsx',
      'src/components/GroupChatWindow.tsx',
      'src/components/FeedSection.tsx',
      'src/components/FriendsList.tsx',
      'src/components/AdminConsole.tsx'
    ];

    for (const relPath of filesList) {
      const fullPath = path.resolve(process.cwd(), relPath);
      if (fs.existsSync(fullPath)) {
        combinedText += `\n\n========================================================================\n`;
        combinedText += `📄 TÊN FILE: ${relPath}\n`;
        combinedText += `========================================================================\n\n`;
        try {
          const code = fs.readFileSync(fullPath, 'utf8');
          combinedText += code;
        } catch (err: any) {
          combinedText += `[LỖI ĐỌC NỘI DUNG FILE: ${err.message}]`;
        }
      }
    }

    // 1. Create a dynamic new Google Document
    const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${googleAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title: docTitle })
    });

    if (!createRes.ok) {
      const errorText = await createRes.text();
      console.error('Google Docs API Create Error:', errorText);
      return res.status(createRes.status).json({ 
        error: 'Không thể khởi tạo file Google Docs mới. Hãy kiểm tra lại phân quyền tài khoản của bạn.' 
      });
    }

    const { documentId } = await createRes.json() as { documentId: string };

    // 2. batchUpdate to write all consolidated files content in Google Doc
    const updateRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${googleAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              text: combinedText,
              location: {
                index: 1
              }
            }
          }
        ]
      })
    });

    if (!updateRes.ok) {
      const errorText = await updateRes.text();
      console.error('Google Docs API Update Error:', errorText);
      return res.status(updateRes.status).json({ 
        error: 'Hoàn thành tạo file Docs nhưng gặp lỗi khi lưu văn bản mã nguồn vào file Google Docs.' 
      });
    }

    res.json({
      success: true,
      documentId,
      docUrl: `https://docs.google.com/document/d/${documentId}/edit`,
      title: docTitle
    });

  } catch (err: any) {
    console.error('Export Google Docs API error:', err);
    res.status(500).json({ error: 'Gặp sự cố lỗi hệ thống khi xử lý kết nối Google Docs.' });
  }
});

// Export all codebase source files as a downloadable ZIP file
app.get('/api/export/zip', authenticateAdminMiddleware, (req: any, res) => {
  try {
    const zip = new AdmZip();
    const rootFiles = [
      'index.html',
      'package.json',
      'vite.config.ts',
      'tsconfig.json',
      'server.ts',
      '.env.example',
      '.gitignore'
    ];

    for (const filename of rootFiles) {
      const fullPath = path.resolve(process.cwd(), filename);
      if (fs.existsSync(fullPath)) {
        zip.addLocalFile(fullPath);
      }
    }

    const srcPath = path.resolve(process.cwd(), 'src');
    if (fs.existsSync(srcPath)) {
      zip.addLocalFolder(srcPath, 'src');
    }

    const zipBuffer = zip.toBuffer();
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=znet_source_code.zip`);
    res.send(zipBuffer);
  } catch (err: any) {
    console.error('Export ZIP API error:', err);
    res.status(500).json({ error: 'Gặp sự cố lỗi hệ thống khi đóng gói file ZIP.' });
  }
});

// Export the unified design layout code (znet_design.html) directly as JSON structure
app.get('/api/export/znet-design', (req, res) => {
  try {
    const designPath = path.resolve(process.cwd(), 'znet_design.html');
    if (!fs.existsSync(designPath)) {
      return res.status(404).json({ error: 'Không tìm thấy file thiết kế znet_design.html trên máy chủ.' });
    }
    const htmlContent = fs.readFileSync(designPath, 'utf-8');
    res.json({ html: htmlContent });
  } catch (err: any) {
    console.error('Export design html error:', err);
    res.status(500).json({ error: 'Gặp sự cố khi đọc file thiết kế znet_design.html.' });
  }
});

// Google Drive: Export packed project ZIP file directly to the user's Google Drive
app.post('/api/export/google-drive', authenticateAdminMiddleware, async (req: any, res) => {
  try {
    const { googleAccessToken } = req.body;
    if (!googleAccessToken) {
      return res.status(400).json({ error: 'Yêu cầu Google Access Token hợp lệ để tải file lên Google Drive.' });
    }

    const fileName = `ZNet_Source_Code_${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;

    // 1. Pack full codebase into a ZIP in-memory buffer
    const zip = new AdmZip();
    const rootFiles = [
      'index.html',
      'package.json',
      'vite.config.ts',
      'tsconfig.json',
      'server.ts',
      '.env.example',
      '.gitignore'
    ];

    for (const filename of rootFiles) {
      const fullPath = path.resolve(process.cwd(), filename);
      if (fs.existsSync(fullPath)) {
        zip.addLocalFile(fullPath);
      }
    }

    const srcPath = path.resolve(process.cwd(), 'src');
    if (fs.existsSync(srcPath)) {
      zip.addLocalFolder(srcPath, 'src');
    }

    const zipBuffer = zip.toBuffer();

    // 2. Create the file metadata in Google Drive (API v3)
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${googleAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: fileName,
        mimeType: 'application/zip'
      })
    });

    if (!createRes.ok) {
      const errorText = await createRes.text();
      console.error('Google Drive Create File Error:', errorText);
      return res.status(createRes.status).json({ 
        error: 'Không thể khởi tạo tệp tin ZIP mới trên Google Drive. Vui lòng xác thực phân quyền.' 
      });
    }

    const { id: fileId } = await createRes.json() as { id: string };

    // 3. Upload the actual zip binary data (API v3 media PATCH)
    const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${googleAccessToken}`,
        'Content-Type': 'application/zip'
      },
      body: zipBuffer
    });

    if (!uploadRes.ok) {
      const errorText = await uploadRes.text();
      console.error('Google Drive Upload Content Error:', errorText);
      return res.status(uploadRes.status).json({ 
        error: 'Đã tạo tệp tin nhưng gặp lỗi khi đăng tải nội dung mã nguồn nhị phân (.zip) lên đám mây.' 
      });
    }

    res.json({
      success: true,
      fileId,
      docUrl: `https://drive.google.com/file/d/${fileId}/view`,
      title: fileName
    });

  } catch (err: any) {
    console.error('Export Google Drive API error:', err);
    res.status(500).json({ error: 'Gặp sự cố lỗi hệ thống khi liên kết máy chủ Google Drive.' });
  }
});

// User: Get specific user profile details with friendship state
app.get('/api/users/profile/:userId', authenticateUserMiddleware, async (req: any, res) => {
  try {
    const targetUserId = parseInt(req.params.userId);
    const currentUserId = req.user.id;

    if (isNaN(targetUserId)) {
      return res.status(400).json({ error: 'Mã định danh thành viên không hợp lệ' });
    }

    const userData = await dbGet(
      'SELECT id, username, avatar, status, role, created_at as createdAt FROM users WHERE id = ?',
      [targetUserId]
    );

    if (!userData) {
      return res.status(404).json({ error: 'Không tìm thấy thành viên này trong hệ thống' });
    }

    // Get relationship status
    const rel = await dbGet(
      'SELECT status, user_id as initiatorId FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
      [currentUserId, targetUserId, targetUserId, currentUserId]
    );

    const userFeeds = await dbAll(
      `SELECT f.id, f.content, f.likes_count as likesCount, f.created_at as createdAt,
              (SELECT COUNT(*) FROM feed_likes WHERE feed_id = f.id AND user_id = ?) as hasLiked,
              (SELECT COUNT(*) FROM comments WHERE feed_id = f.id) as commentsCount
       FROM feeds f
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC
       LIMIT 20`,
      [currentUserId, targetUserId]
    );

    res.json({
      user: userData,
      relationship: rel ? { status: rel.status, initiatorId: rel.initiatorId } : null,
      feeds: userFeeds
    });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tải hồ sơ dữ liệu thành viên' });
  }
});

// Auto-deletion background task running every minute checking for 00:00 midnight
setInterval(async () => {
  try {
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) {
      console.log("[ZNET CRON] Khởi chạy tiến trình dọn dẹp tin nhắn định kỳ lúc 00:00...");

      // Autodelete private messages
      const usersWithPmDel = await dbAll('SELECT id FROM users WHERE auto_delete_pms = 1');
      const pmUserIds = usersWithPmDel.map(u => u.id);
      if (pmUserIds.length > 0) {
        const placeholders = pmUserIds.map(() => '?').join(',');
        await dbRun(
          `DELETE FROM messages WHERE sender_id IN (${placeholders}) OR receiver_id IN (${placeholders})`,
          [...pmUserIds, ...pmUserIds]
        );
        console.log(`[ZNET CRON] Đã dọn dẹp tin nhắn riêng cho ${pmUserIds.length} người dùng.`);
      }

      // Autodelete group messages
      const usersWithGroupDel = await dbAll('SELECT id FROM users WHERE auto_delete_groups = 1');
      const groupUserIds = usersWithGroupDel.map(u => u.id);
      if (groupUserIds.length > 0) {
        const placeholders = groupUserIds.map(() => '?').join(',');
        await dbRun(
          `DELETE FROM group_messages WHERE sender_id IN (${placeholders})`,
          groupUserIds
        );
        console.log(`[ZNET CRON] Đã dọn dẹp tin nhắn nhóm cho ${groupUserIds.length} người dùng.`);
      }
    }
  } catch (err) {
    console.error("[ZNET CRON CHẠY LỖI]:", err);
  }
}, 60000);

// Admin authenticate middleware
async function authenticateAdminMiddleware(req: any, res: any, next: any) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Thiếu mã thông báo xác thực quyền quản trị' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Mã xác thực không hợp lệ hoặc đã hết hạn' });
    }
    
    // Fetch user details to verify role
    const user = await dbGet('SELECT role FROM users WHERE id = ?', [decoded.id]);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Bạn không có quyền quản lý tối cao (Admin) trên hệ thống ZNet.' });
    }
    req.user = { ...decoded, role: user.role };
    next();
  } catch (err) {
    console.error("Admin authentication error:", err);
    res.status(500).json({ error: 'Xác thực tài khoản Admin thất bại' });
  }
}

// Get admin system indicators
app.get('/api/admin/system-stats', authenticateAdminMiddleware, async (req: any, res) => {
  try {
    const dbSize = await dbGet("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()");
    const userCount = await dbGet("SELECT COUNT(*) as count FROM users");
    const feedCount = await dbGet("SELECT COUNT(*) as count FROM feeds");
    const msgCount = await dbGet("SELECT COUNT(*) as count FROM messages");
    const friendCount = await dbGet("SELECT COUNT(*) as count FROM friends");

    const uptimeSec = Math.floor(process.uptime());
    const ramUsageMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    res.json({
      dbSize: dbSize ? dbSize.size : 0,
      users: userCount ? userCount.count : 0,
      feeds: feedCount ? feedCount.count : 0,
      messages: msgCount ? msgCount.count : 0,
      friends: friendCount ? friendCount.count : 0,
      uptime: uptimeSec,
      ramMb: ramUsageMb,
      activeWsConnections: activeSockets.size,
      nodeVersion: process.version,
      platform: process.platform
    });
  } catch (err: any) {
    console.error("Error fetching system stats:", err);
    res.status(500).json({ error: 'Lỗi đồng bộ máy chủ hệ thống' });
  }
});

// Admin Database Explorer dynamic viewer
app.get('/api/admin/table/:tableName', authenticateAdminMiddleware, async (req: any, res) => {
  try {
    const tableName = req.params.tableName;
    if (!['users', 'feeds', 'messages', 'friends'].includes(tableName)) {
      return res.status(400).json({ error: 'Bảng dữ liệu không hợp lệ hoặc bị khóa bảo mật' });
    }

    let rows = [];
    if (tableName === 'users') {
      rows = await dbAll("SELECT id, username, role, status, created_at, two_factor_enabled FROM users ORDER BY id DESC LIMIT 100");
    } else {
      rows = await dbAll(`SELECT * FROM ${tableName} ORDER BY id DESC LIMIT 100`);
    }

    res.json(rows);
  } catch (err: any) {
    console.error(`Error querying table ${req.params.tableName}:`, err);
    res.status(500).json({ error: 'Lỗi truy vấn dữ liệu SQL Lite' });
  }
});

// Admin action: Delete Feed
app.delete('/api/admin/feeds/delete/:id', authenticateAdminMiddleware, async (req: any, res) => {
  try {
    const feedId = parseInt(req.params.id);
    await dbRun("DELETE FROM feeds WHERE id = ?", [feedId]);
    res.json({ success: true, message: `Đã xóa bài đăng ID ${feedId} thành công.` });
  } catch (err) {
    console.error("Admin post delete failed:", err);
    res.status(500).json({ error: 'Không thể xóa bài đăng do lỗi CSDL máy chủ' });
  }
});

// Admin action: Delete or Terminate user account (safely)
app.delete('/api/admin/users/delete/:id', authenticateAdminMiddleware, async (req: any, res) => {
  try {
    const delUserId = parseInt(req.params.id);
    const currentUserId = req.user.id;

    if (delUserId === currentUserId) {
      return res.status(400).json({ error: 'Bạn không được phép tự xóa tài khoản của chính mình!' });
    }

    const selfUser = await dbGet("SELECT username FROM users WHERE id = ?", [delUserId]);
    if (!selfUser) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng này trên CSDL' });
    }
    if (selfUser.username === 'admin') {
      return res.status(400).json({ error: 'Bạn không được phép xóa tài khoản Admin tối cao.' });
    }

    // Begin cascades manually in SQLite
    await dbRun("DELETE FROM feeds WHERE user_id = ?", [delUserId]);
    await dbRun("DELETE FROM messages WHERE sender_id = ? OR receiver_id = ?", [delUserId, delUserId]);
    await dbRun("DELETE FROM friends WHERE user_id = ? OR friend_id = ?", [delUserId, delUserId]);
    await dbRun("DELETE FROM users WHERE id = ?", [delUserId]);

    // Force disconnect socket if active
    if (activeSockets.has(delUserId)) {
      const uws = activeSockets.get(delUserId);
      if (uws) {
        uws.send(JSON.stringify({ type: 'force_logout', message: 'Tài khoản của bạn đã bị quản trị viên đình chỉ hoạt động.' }));
        uws.close();
      }
      activeSockets.delete(delUserId);
    }

    res.json({ success: true, message: `Tài khoản '${selfUser.username}' đã bị xóa vĩnh viễn khỏi máy chủ.` });
  } catch (err) {
    console.error("Admin user delete failed:", err);
    res.status(500).json({ error: 'Có sự cố khi tiến hành thu hồi tài khoản' });
  }
});

// Admin action: Broadcast system notice to all active websockets
app.post('/api/admin/broadcast', authenticateAdminMiddleware, async (req: any, res) => {
  try {
    const { message } = req.body;
    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Thông điệp phát sóng hệ thống không được để trống' });
    }

    const sysAvatar = 'https://api.dicebear.com/7.x/pixel-art/svg?seed=admin';
    
    // Broadcast notification string to all websocket sockets
    let count = 0;
    const packet = JSON.stringify({ 
      type: 'system_broadcast', 
      text: message,
      senderName: 'MÁY CHỦ ZNET (ADMIN)',
      avatar: sysAvatar,
      createdAt: new Date().toISOString()
    });

    for (const [uid, ws] of activeSockets.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(packet);
        count++;
      }
    }

    res.json({ success: true, message: `Phát sóng thành công tới ${count} thiết bị đang trực tuyến!` });
  } catch (err) {
    console.error("Admin broadcast failure:", err);
    res.status(500).json({ error: 'Sự cố lỗi phát sóng máy chủ' });
  }
});

// -- Real-Time WebSocket Logic--
const activeSockets = new Map<number, WebSocket>();

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws: WebSocket) => {
  let authenticatedUserId: number | null = null;

  ws.on('message', async (data: string) => {
    try {
      const parsedData = JSON.parse(data);

      switch (parsedData.type) {
        case 'auth': {
          const { token } = parsedData;
          const userPayload = verifyToken(token);
          if (userPayload) {
            authenticatedUserId = userPayload.id;
            activeSockets.set(userPayload.id, ws);

            // Broadcast presence to all users that they are active
            broadcastPresenceUpdate(userPayload.id, 'online');

            console.log(`User connected to ZNet socket: ID ${userPayload.id} (${userPayload.username})`);
            ws.send(JSON.stringify({ type: 'auth_success', userId: userPayload.id }));
          } else {
            ws.send(JSON.stringify({ type: 'auth_failed', error: 'Xác thực tài khoản Websocket thất bại' }));
            ws.close();
          }
          break;
        }

        case 'message': {
          if (!authenticatedUserId) {
            ws.send(JSON.stringify({ type: 'error', error: 'Chưa thực hiện kết nối xác thực!' }));
            return;
          }
          const { receiverId, text } = parsedData;
          if (!receiverId || !text || text.trim() === '') return;

          // Insert secure message to SQLite DB
          const result = await dbRun(
            'INSERT INTO messages (sender_id, receiver_id, message_text) VALUES (?, ?, ?)',
            [authenticatedUserId, receiverId, text]
          );

          const timeStr = new Date().toISOString();

          // Acknowledge back to sender
          ws.send(JSON.stringify({
            type: 'message_ack',
            id: result.id,
            receiverId,
            text,
            createdAt: timeStr
          }));

          // Direct route if destination exists
          const destinationSocket = activeSockets.get(receiverId);
          if (destinationSocket && destinationSocket.readyState === WebSocket.OPEN) {
            destinationSocket.send(JSON.stringify({
              type: 'message_recv',
              id: result.id,
              senderId: authenticatedUserId,
              text,
              createdAt: timeStr
            }));
          }
          break;
        }

        case 'group_message': {
          if (!authenticatedUserId) {
            ws.send(JSON.stringify({ type: 'error', error: 'Chưa thực hiện kết nối xác thực!' }));
            return;
          }
          const { groupId, text } = parsedData;
          if (!groupId || !text || text.trim() === '') return;

          const gIdNum = parseInt(groupId);
          if (isNaN(gIdNum)) return;

          // Verify user is in group
          const isMember = await dbGet('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?', [gIdNum, authenticatedUserId]);
          if (!isMember) {
            ws.send(JSON.stringify({ type: 'error', error: 'Bạn không thuộc nhóm chat này' }));
            return;
          }

          // Insert group message
          const result = await dbRun(
            'INSERT INTO group_messages (group_id, sender_id, message_text) VALUES (?, ?, ?)',
            [gIdNum, authenticatedUserId, text]
          );

          const timeStr = new Date().toISOString();

          // Fetch sender details
          const sender = await dbGet('SELECT username, avatar FROM users WHERE id = ?', [authenticatedUserId]);

          // Fetch all group members
          const members = await dbAll('SELECT user_id FROM group_members WHERE group_id = ?', [gIdNum]);

          // Broad cast payload
          const payload = JSON.stringify({
            type: 'group_message_recv',
            id: result.id,
            groupId: gIdNum,
            senderId: authenticatedUserId,
            senderName: sender?.username || 'User',
            senderAvatar: sender?.avatar || '',
            text,
            createdAt: timeStr
          });

          // Send to everyone in the group
          members.forEach((memb: any) => {
            const memberSocket = activeSockets.get(memb.user_id);
            if (memberSocket && memberSocket.readyState === WebSocket.OPEN) {
              memberSocket.send(payload);
            }
          });
          break;
        }

        case 'typing': {
          if (!authenticatedUserId) return;
          const { receiverId, isTyping } = parsedData;
          const destinationSocket = activeSockets.get(receiverId);
          if (destinationSocket && destinationSocket.readyState === WebSocket.OPEN) {
            destinationSocket.send(JSON.stringify({
              type: 'typing_recv',
              senderId: authenticatedUserId,
              isTyping
            }));
          }
          break;
        }

        case 'presence_query': {
          if (!authenticatedUserId) return;
          const { friendIds } = parsedData;
          if (Array.isArray(friendIds)) {
            const result: { [key: number]: string } = {};
            friendIds.forEach((fId: number) => {
              result[fId] = activeSockets.has(fId) ? 'online' : 'offline';
            });
            ws.send(JSON.stringify({
              type: 'presence_resp',
              presence: result
            }));
          }
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error("Websocket server exception:", err);
      try {
        ws.send(JSON.stringify({ type: 'error', error: 'Đã xảy ra lỗi truyền trạng thái truyền tải' }));
      } catch (wsErr) {
        // Suppress nested error
      }
    }
  });

  ws.on('close', () => {
    try {
      if (authenticatedUserId) {
        activeSockets.delete(authenticatedUserId);
        broadcastPresenceUpdate(authenticatedUserId, 'offline');
        console.log(`User status disconnected from socket: ID ${authenticatedUserId}`);
      }
    } catch (e) {
      console.error("Websocket socket close error:", e);
    }
  });

  ws.on('error', (err) => {
    console.error(`Socket error from user ID ${authenticatedUserId}:`, err);
  });
});

// Helper to broadcast presence
function broadcastPresenceUpdate(userId: number, status: 'online' | 'offline') {
  try {
    const payload = JSON.stringify({
      type: 'presence_change',
      userId,
      status
    });
    activeSockets.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  } catch (error) {
    console.error("Presence broadcast failed:", error);
  }
}

// Start up Database before binding ports
initializeDatabase().then(async () => {
  // Setup full HTTP integration
  const httpServer = http.createServer(app);

  // Upgrade WebSocket upgrades with Vite support bypass
  httpServer.on('upgrade', (request, socket, head) => {
    try {
      if (request.url?.startsWith('/@vite') || request.url?.startsWith('/vite') || request.url?.includes('hmr')) {
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } catch (error) {
      console.error("Upgrade WebSocket extraction exception:", error);
    }
  });

  // Dynamic route to serve the combined design layout file directly
  app.get('/znet_design.html', (req, res) => {
    try {
      res.sendFile(path.join(process.cwd(), 'znet_design.html'));
    } catch (err) {
      res.status(500).send('Không thể kết xuất trang thiết kế');
    }
  });

  // API endpoints to serve clean workspace files for remote sync
  app.get('/api/sync/file', (req, res) => {
    try {
      const relativePath = String(req.query.path || '');
      const allowedFiles = [
        'server.ts',
        'src/App.tsx',
        'src/components/AuthForm.tsx',
        'src/components/ExportDocsSection.tsx'
      ];
      if (!allowedFiles.includes(relativePath)) {
        return res.status(403).json({ error: 'Truy cập bị từ chối. Chỉ các file cấu phần cấu hoạt mới được phép đồng bộ.' });
      }
      const fullPath = path.resolve(process.cwd(), relativePath);
      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: `Không tìm thấy file ${relativePath} trong Workspace AI Studio.` });
      }
      res.sendFile(fullPath);
    } catch (err: any) {
      console.error('File sync API error:', err);
      res.status(500).json({ error: err.message || 'Lỗi bất định khi gửi tệp đồng bộ.' });
    }
  });

  // Serve the shell patcher script
  app.get('/api/sync/znet-patcher.sh', (req, res) => {
    try {
      // Dynamically get the protocol and host from request or fallback
      const host = req.headers.host || 'ais-dev-sm5yyzpkjwklyqz6nhi5sx-914176156127.asia-east1.run.app';
      const scheme = req.headers['x-forwarded-proto'] || 'https';
      const workspaceUrl = `${scheme}://${host}`;

      const script = `#!/bin/bash
# ==============================================================================
# ZNET AUTOMATIC SYNC & PATCHER UTILITY SCRIPT (v1.0.3)
# Tự động đồng bộ mã nguồn hoàn chỉnh, đồng bộ giao diện và khắc phục lỗi Cloudflare
# ==============================================================================

RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
BLUE='\\033[0;34m'
CYAN='\\033[0;36m'
NC='\\033[0;30m' # No Color
BOLD='\\033[1m'

clear
echo -e "\${CYAN}\${BOLD}=========================================================================\${NC}"
echo -e "\${CYAN}\${BOLD}         HỆ THỐNG ĐỒNG BỘ DỰ ÁN & ĐỒNG BỘ GIAO DIỆN ZNET TỰ ĐỘNG         \${NC}"
echo -e "\${CYAN}\${BOLD}=========================================================================\${NC}"
echo -e "Nguồn Workspace AI Studio: \${BLUE}${workspaceUrl}\${NC}"
echo ""

# 1. Định vị thư mục cài đặt dự án Znet
TARGET_DIR="/root/znet"
if [ ! -d "\$TARGET_DIR" ]; then
    TARGET_DIR=\$(pwd)
    echo -e "\${YELLOW}⚠️  Không tìm thấy thư mục mặc định /root/znet, sử dụng thư mục hiện hoạt: \$TARGET_DIR\${NC}"
else
    cd "\$TARGET_DIR"
    echo -e "\${GREEN}👉 Đã chuyển đến thư mục cài đặt dự án: \$TARGET_DIR\${NC}"
fi

# Xác minh lại tính chính xác của thư mục
if [ ! -f "package.json" ]; then
    echo -e "\${RED}❌ LỖI: Không tìm thấy tệp package.json! Hãy chắc chắn bạn đang chạy script này từ bên trong thư mục cài đặt ZNet.\${NC}"
    exit 1
fi

# 2. Tạo bản sao lưu dự phòng (Backups)
echo -e "\${BLUE}👉 Đang tạo bản sao lưu an toàn cho mã nguồn cũ đề phòng sự cố...\${NC}"
mkdir -p .znet_backup
TIMESTAMP=\$(date +%s)
[ -f "server.ts" ] && cp "server.ts" ".znet_backup/server.ts.bak_\$TIMESTAMP"
[ -f "src/App.tsx" ] && cp "src/App.tsx" ".znet_backup/App.tsx.bak_\$TIMESTAMP"
[ -f "src/components/AuthForm.tsx" ] && cp "src/components/AuthForm.tsx" ".znet_backup/AuthForm.tsx.bak_\$TIMESTAMP"
[ -f "src/components/ExportDocsSection.tsx" ] && cp "src/components/ExportDocsSection.tsx" ".znet_backup/ExportDocsSection.tsx.bak_\$TIMESTAMP"
echo -e "\${GREEN}✅ Đã tạo sao lưu thành công trong thư mục: \$TARGET_DIR/.znet_backup/\${NC}"

# 3. Tiến hành tải các tệp vá lỗi (Hotfix files)
download_patch_file() {
    local rel_path="\$1"
    local dest="\$2"
    echo -e "⏳ Đang tải tệp: \${YELLOW}\$rel_path\${NC}..."
    curl -s -f "${workspaceUrl}/api/sync/file?path=\$rel_path" -o "\$dest"
    if [ \$? -ne 0 ]; then
        echo -e "\${RED}❌ LỖI: Không thể tải tệp \$rel_path từ Workspace AI Studio!\${NC}"
        echo -e "Có thể do môi trường Workspace tạm thời bị ngắt kết nối. Vui lòng mở lại trình lướt AI Studio."
        exit 1
    fi
}

# Tải xuống toàn bộ 4 tệp cốt lõi được cập nhật sạch sẽ
download_patch_file "server.ts" "server.ts"
download_patch_file "src/App.tsx" "src/App.tsx"
download_patch_file "src/components/AuthForm.tsx" "src/components/AuthForm.tsx"
download_patch_file "src/components/ExportDocsSection.tsx" "src/components/ExportDocsSection.tsx"

echo -e "\${GREEN}✅ Đã cập nhật 100% mã nguồn sạch mới nhất từ AI Studio!\${NC}"

# 4. Tiến hành Biên Dịch (npm run build)
echo -e "\${BLUE}🛠️  Đang biên dịch build lại dự án Front-End và Express Server bằng Vite & Esbuild...\${NC}"
npm run build
if [ \$? -ne 0 ]; then
    echo -e "\${RED}❌ LỖI: Biên dịch Build hệ thống gặp sự cố! Hãy kiểm tra log code hoặc chạy lại lệnh thủ công.\${NC}"
    exit 1
fi
echo -e "\${GREEN}✅ Đã Biên Dịch Thành Công! Toàn bộ file tĩnh và tệp server/server.cjs đã sẵn sàng.\${NC}"

# 5. Tự động khởi động lại dịch vụ Máy Chủ
echo -e "\${BLUE}🔄 Đang khởi động lại tiến trình server ZNet tại cổng 3000...\${NC}"
if command -v pm2 &> /dev/null; then
    echo -e "🚀 Đang khởi động lại dịch vụ ZNet thông qua PM2..."
    pm2 restart znet || pm2 start dist/server.cjs --name "znet" --env production
    pm2 save
else
    echo -e "⚠️  Không tìm thấy PM2. Đang tiến hành giải phóng cổng 3000 và khởi chạy thông qua Nohup..."
    kill -9 \$(lsof -t -i:3000) &> /dev/null
    nohup node dist/server.cjs > znet_runtime.log 2>&1 &
    echo -e "Nhật ký runtime được lưu trực tuyến tại tệp: znet_runtime.log"
fi

echo -e "\${GREEN}\${BOLD}=========================================================================\${NC}"
echo -e "\${GREEN}\${BOLD} 🎉  ĐỒNG BỘ HOÀN TẤT & KHẮC PHỤC LỖI THÀNH CÔNG RỰC RỠ!                 \${NC}"
echo -e "\${GREEN}\${BOLD}     - Đã dọn dẹp các lối tắt gỡ lỗi, đồng bộ mã nguồn an toàn thành công\${NC}"
echo -e "\${GREEN}\${BOLD}     - Giữ nguyên 100% phong cách thiết kế, giao diện, dữ liệu\${NC}"
echo -e "\${GREEN}\${BOLD}     - Hãy tải lại trang web trên trình duyệt của bạn để nhận bản cập nhật!  \${NC}"
echo -e "\${GREEN}\${BOLD}=========================================================================\${NC}"
`;
      res.setHeader('Content-Type', 'application/x-sh');
      res.send(script);
    } catch (err: any) {
      console.error('Patcher generator error:', err);
      res.status(500).send('Lỗi máy chủ khi tạo mã patcher.');
    }
  });

  // Chặn toàn bộ các yêu cầu /api/* không tìm thấy và trả về lỗi JSON chuẩn hóa
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      error: `Không tìm thấy API hoặc phương thức yêu cầu không hợp lệ: ${req.method} ${req.url}. Hãy đảm bảo đường truyền được cập bến hoàn hảo.`
    });
  });

  // Global API error response handler mượt mà, tránh xuất ra trang HTML lỗi của Express
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("ZNet Server Global Error Encountered:", err);
    res.status(err.status || 500).json({
      error: err.message || 'Máy chủ ZNet xảy ra ngoại lệ ngoài ý muốn. Đang tự động định tuyến phục hồi.'
    });
  });

  // Vite development bundler integration - robust and crash-proof
  const isProd = process.env.NODE_ENV === 'production' || 
                 !fs.existsSync(path.join(process.cwd(), 'src/App.tsx')) ||
                 (typeof __filename !== 'undefined' && (__filename.endsWith('.cjs') || __filename.includes('dist')));

  if (!isProd) {
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa'
      });
      app.use(vite.middlewares);
      console.log("[ZNET] Vite development middleware integrated successfully.");
    } catch (viteErr) {
      console.error("[ZNET] Failed to initialize Vite dev server, falling back to static server:", viteErr);
      serveStaticProduction();
    }
  } else {
    serveStaticProduction();
  }

  function serveStaticProduction() {
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        try {
          res.sendFile(path.join(distPath, 'index.html'));
        } catch (error) {
          res.status(500).send('Lỗi máy chủ phân phối Static Pages');
        }
      });
      console.log(`[ZNET] Serving production static files from: ${distPath}`);
    } else {
      console.warn(`[ZNET] Warning: Static distribution path does not exist at ${distPath}. Please build the project.`);
      // Even if dist does not exist, send a friendly error instead of crashing
      app.get('*', (req, res) => {
        res.status(404).send('ZNet distribution files are missing. Please run "npm run build" first.');
      });
    }
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running at: http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error("Startup application exception on main server script:", err);
});
