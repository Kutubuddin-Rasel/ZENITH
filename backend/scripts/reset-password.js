/**
 * Password Reset Script for Super Admin
 * 
 * This script connects to the database and resets the password for a specific user.
 * Usage: node reset-password.js <email> <new-password>
 */

const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// Read environment variables from .env file
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};

envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let value = match[2].trim();
    // Remove quotes if present
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    envVars[key] = value;
  }
});

// Get command line arguments
const email = process.argv[2];
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.error('Usage: node reset-password.js <email> <new-password>');
  process.exit(1);
}

async function resetPassword() {
  // Create a database connection
  const client = new Client({
    host: envVars.DATABASE_HOST || 'localhost',
    port: envVars.DATABASE_PORT || 5432,
    user: envVars.DATABASE_USER || 'postgres',
    password: envVars.DATABASE_PASS || 'password',
    database: envVars.DATABASE_NAME || 'zenith',
  });

  try {
    // Connect to the database
    await client.connect();
    console.log('Connected to the database');

    // Check if the user exists
    const userResult = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    
    if (userResult.rows.length === 0) {
      console.error(`User with email ${email} not found`);
      process.exit(1);
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update the user's password
    await client.query('UPDATE users SET "passwordHash" = $1 WHERE email = $2', [hashedPassword, email]);
    
    console.log(`Password for ${email} has been reset successfully!`);
    console.log('You can now log in with the new password.');

  } catch (error) {
    console.error('Error resetting password:', error);
  } finally {
    // Close the database connection
    await client.end();
  }
}

resetPassword();
