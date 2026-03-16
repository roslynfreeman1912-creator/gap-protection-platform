#!/usr/bin/env node
/**
 * GAP Protection Setup Script (Node.js version)
 * Cross-platform setup for Windows, Linux, and macOS
 */

import { execSync } from 'child_process';
import { existsSync, copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function checkCommand(command, name) {
  try {
    execSync(`${command} --version`, { stdio: 'ignore' });
    log(`✅ ${name} found`, colors.green);
    return true;
  } catch {
    log(`❌ ${name} not found`, colors.red);
    return false;
  }
}

function main() {
  log('\n🛡️  GAP Protection - Setup Script', colors.cyan);
  log('==================================\n', colors.cyan);

  // Check Python
  log('Checking Python version...', colors.cyan);
  if (!checkCommand('python', 'Python') && !checkCommand('python3', 'Python')) {
    log('Please install Python 3.11+ from https://python.org', colors.red);
    process.exit(1);
  }

  // Check Node.js
  log('\nChecking Node.js version...', colors.cyan);
  if (!checkCommand('node', 'Node.js')) {
    log('Please install Node.js 18+ from https://nodejs.org', colors.red);
    process.exit(1);
  }

  // Create .env if not exists
  log('\nChecking .env file...', colors.cyan);
  if (!existsSync('.env')) {
    log('Creating .env file from template...', colors.yellow);
    copyFileSync('.env.example', '.env');
    log('⚠️  Please edit .env and add your API keys!', colors.yellow);
  } else {
    log('✅ .env file exists', colors.green);
  }

  // Install Python dependencies
  log('\nInstalling Python dependencies...', colors.cyan);
  try {
    const pythonCmd = existsSync('python') ? 'python' : 'python3';
    execSync(`${pythonCmd} -m pip install -e .`, { stdio: 'inherit' });
    log('✅ Python dependencies installed', colors.green);
  } catch (error) {
    log('❌ Failed to install Python dependencies', colors.red);
    process.exit(1);
  }

  // Install Node dependencies
  log('\nInstalling Node.js dependencies...', colors.cyan);
  try {
    execSync('npm install', { stdio: 'inherit' });
    log('✅ Node.js dependencies installed', colors.green);
  } catch (error) {
    log('❌ Failed to install Node.js dependencies', colors.red);
    process.exit(1);
  }

  // Create necessary directories
  log('\nCreating directories...', colors.cyan);
  const dirs = ['logs', 'reports', 'vuln'];
  dirs.forEach(dir => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      log(`✅ Created ${dir}/`, colors.green);
    }
  });

  // Check database configuration
  log('\nChecking database configuration...', colors.cyan);
  if (existsSync('.env')) {
    const envContent = require('fs').readFileSync('.env', 'utf8');
    if (envContent.includes('DATABASE_URL=postgresql')) {
      log('⚠️  Database configured. Run "npm run db:push" to initialize schema.', colors.yellow);
    }
  }

  log('\n✅ Setup complete!', colors.green);
  log('\nNext steps:', colors.cyan);
  log('1. Edit .env and add your API keys');
  log('2. If using database: npm run db:push');
  log('3. Start development: npm run dev');
  log('4. Or build for production: npm run build && npm start\n');
}

main();
