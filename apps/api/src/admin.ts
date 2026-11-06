import postgres from 'postgres';
import { hashPassword, normalizeUsername } from './auth.js';

const username = normalizeUsername(process.argv[2] || '');
const password = process.env.SERVERMAP_ADMIN_PASSWORD || '';
const connectionString = process.env.DATABASE_URL;
if (!/^[a-z0-9_.-]{3,50}$/.test(username)) {
  console.error('Usage: SERVERMAP_ADMIN_PASSWORD=<strong password> node dist/admin.js <username>');
  process.exit(1);
}
if (password.length < 12 || password.length > 256) {
  console.error('SERVERMAP_ADMIN_PASSWORD must be between 12 and 256 characters');
  process.exit(1);
}
if (!connectionString) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const sql = postgres(connectionString, { max: 1 });
try {
  await sql`CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username varchar(50) NOT NULL UNIQUE,
    password_hash text NOT NULL,
    role varchar(20) NOT NULL DEFAULT 'admin',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  const hashed = await hashPassword(password);
  await sql.begin(async tx => {
    const rows = await tx`INSERT INTO users (username,password_hash,role)
      VALUES (${username},${hashed},'admin')
      ON CONFLICT (username) DO UPDATE SET password_hash = excluded.password_hash, is_active = true
      RETURNING id`;
    await tx`DELETE FROM user_sessions WHERE user_id = ${rows[0].id}`;
  });
  console.log('Admin user created / password updated:', username);
} catch (error) {
  console.error('Could not create admin; start the API once first so database tables are initialized.');
  console.error(error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
