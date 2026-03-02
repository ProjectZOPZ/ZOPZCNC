function replaceUsername(text, user) {
    const username = user?.username || 'unknown';
    return text
        .replace(/{username.user}/g, username)
        .replace(/{clear}/g, '\x1b[2J\x1b[H')
        .replace(/<<\$clear>>/g, '\x1b[2J\x1b[H');
}


function replaceCNCname(text, name) 
{
    return text.replace(/{cnc.name}/g, name);
}

function sanitizeAdminLines(text, user) 
{
    if (!user || typeof user.admin === 'undefined') return text;
    return user.admin ? text : text.split('\n').filter(line => !line.toLowerCase().includes('admin')).join('\n');
}

function sanitizeResellerLines(text, user) 
{
    if (!user || typeof user.reseller === 'undefined') return text;
    return user.reseller ? text : text.split('\n').filter(line => !line.toLowerCase().includes('reseller')).join('\n');
}

function stripAnsi(str) 
{
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

function clearScreen(stream)
{
  stream.write('\x1B[2J\x1B[H');
}

function resizeTerminal(stream)
{
  stream.write('\x1B[8;24;80t');
}

// sleep helper for async delays
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// process output with real sleeps inside <<sleep(ms)>> tokens
async function processWithSleep(output, stream = process.stdout) {
    const parts = output.split(/(<<sleep\(\d+\)>>)/);
    for (const part of parts) {
        const match = part.match(/<<sleep\((\d+)\)>>/);
        if (match) {
            const ms = parseInt(match[1], 10);
            await sleep(ms);
        } else {
            stream.write(part);
        }
    }
}

// Track start time globally
const startTime = Date.now();

function formatUptime(ms) {
    let totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    totalSeconds %= 86400;
    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}
function replaceTitle(prompt, config, activeSessions, apiHandler, _user) {
    // Ensure spinnerIndex and letterIndex exist
    if (typeof config.spinnerIndex === 'undefined') config.spinnerIndex = 0;
    if (typeof config.letterIndex === 'undefined') config.letterIndex = 0;

    // Choose spinner array based on spinnertype in JSON
    let spinnerType;
    if (config.spinnertype === 'custom' && Array.isArray(config.customSpinner) && config.customSpinner.length) {
        spinnerType = config.customSpinner;
    } else if (Array.isArray(config.defaultSpinner) && config.defaultSpinner.length) {
        spinnerType = config.defaultSpinner;
    } else {
        spinnerType = ["?"]; // fallback if nothing is defined
    }

    // Current spinner frame
    let spinnerChar = spinnerType[config.spinnerIndex];

    if (config.spinnerLetterByLetter) {
        // Print one character at a time
        spinnerChar = spinnerChar[config.letterIndex] || '';
        config.letterIndex = (config.letterIndex + 1) % spinnerType[config.spinnerIndex].length;

        // Move to next spinner string when current fully printed
        if (config.letterIndex === 0) {
            config.spinnerIndex = (config.spinnerIndex + 1) % spinnerType.length;
        }
    } else {
        // Use full string as spinner
        config.spinnerIndex = (config.spinnerIndex + 1) % spinnerType.length;
    }

    // Calculate uptime
    const uptime = formatUptime(Date.now() - startTime);

    // Replace placeholders
    return prompt.replace(/{cnc_name}/g, config.cnc_name)
        .replace(/{online}/g, activeSessions.size)
        .replace(/{used_slots}/g, apiHandler.activeAttacks.size)
        .replace(/{max_slots}/g, config.max_concurrents)
        .replace(/{expiry}/g, _user.expiry)
        .replace(/{spinner}/g, spinnerChar)
        .replace(/{uptime}/g, uptime);
}

function replaceplan(prompt, user) 
{
    return prompt
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
        .replace(/{user.banReason}/g, user.banReason)
        .replace(/{clear}/g, '\x1b[2J\x1b[H')
        .replace(/<<\$clear>>/g, '\x1b[2J\x1b[H');
        // sleep tokens are handled in processWithSleep
}

function replaceResellerstats(text, user) 
{
   return text.replace(/{username}/g, user.username)
          .replace(/{reseller.usersSold}/g, user.usersSold)
          .replace(/{reseller.earnings}/g, user.earnings)
          .replace(/{reseller.owed}/g, user.owed);
}

function redrawInline(stream, buffer, cursorPosition, promptLength, lastDrawnLengthRef)
{
    const cleanBuffer = buffer.replace(/\r|\n/g, ''); 
    const excess = lastDrawnLengthRef.value - cleanBuffer.length;
    let injected = '';
    injected += `\r\x1b[${promptLength + 1}G`;
    injected += cleanBuffer;
    if (excess > 0) 
    {
        injected += ' '.repeat(excess);
        injected += `\x1b[${excess}D`;
    }
    injected += `\x1b[${promptLength + cursorPosition + 1}G`;
    stream.write(injected);
    lastDrawnLengthRef.value = cleanBuffer.length;
}

globalThis.replaceplan = replaceplan;
globalThis.redrawInline = redrawInline;
globalThis.replaceTitle = replaceTitle;
globalThis.replaceCNCname = replaceCNCname;
globalThis.replaceUsername = replaceUsername;

globalThis.stripAnsi = stripAnsi;

globalThis.sanitizeAdminLines = sanitizeAdminLines;
globalThis.sanitizeResellerLines = sanitizeResellerLines;
globalThis.clearScreen = clearScreen;
globalThis.resizeTerminal = resizeTerminal;

globalThis.sleep = sleep;
globalThis.processWithSleep = processWithSleep;
