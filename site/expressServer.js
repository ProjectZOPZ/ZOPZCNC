const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const fsv2 = require('fs').promises;
const bcrypt = require('bcrypt');
const express = require('express');
const net = require('net');
const session = require('express-session');
const url = require('url');

if (typeof __dirname === 'undefined') {
    global.__dirname = path.resolve();
}

eval(fs.readFileSync(path.join(__dirname, './utils/UserUtils.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, './utils/LogUtils.js'), 'utf8'));

const mainConfig = path.join(__dirname, './configs/main.json');
const methodsConfig = path.join(__dirname, './configs/methods.json');

const configPath = path.join(__dirname, './configs/main.json');
const configs = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('json spaces', 2);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, './site'));
app.use(express.static(path.join(__dirname, './site/public')));
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: !!globalThis.config?.api?.cert_path }
}));

app.use((req, res, next) => {
    req.on('error', (err) => {
        if (err.code === 'ECONNRESET') {
            console.warn('⚠️ Request aborted by client (ECONNRESET).');
        } else {
            console.error('Request error:', err);
        }
    });

    res.on('error', (err) => {
        console.error('Response error:', err);
    });

    next();
});

let mongo = undefined;
let config = undefined;
let attackHandler = undefined;

function isValidHost(input) {
    try {
        let hostname = input.replace(/^https?:\/\//, '').split('/')[0];
        if (net.isIP(hostname) === 4) return true;
        const hostnameRegex = /^(?!:\/\/)([a-zA-Z0-9-_]+\.)+[a-zA-Z]{2,}$/;
        return hostnameRegex.test(hostname);
    } catch {
        return false;
    }
}

function isAuthenticated(req, res, next) {
    const { username } = req.session;
    if (!username) {
        console.warn('Authentication failed: Missing session username');
        return res.redirect('/login');
    }
    next();
}

async function isAdmin(req, res, next) {
    try {
        const { username } = req.session;
        if (!username) {
            return res.redirect('/login');
        }
        const user = await mongo.findDocumentByKey('username', username, config.mongo_db_collection);
        if (!user || !user.admin) {
            return res.status(403).send(`
                <!DOCTYPE html>
                <html>
                <head><title>Access Denied</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px; background: #111; color: #fff;">
                    <h1>403 - Access Denied</h1>
                    <p>Admin privileges required to access this page.</p>
                    <a href="/dashboard" style="color: #3b82f6;">Return to Dashboard</a>
                </body>
                </html>
            `);
        }
        req.adminUser = user;
        next();
    } catch (err) {
        console.error('Admin check error:', err);
        return res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head><title>Server Error</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px; background: #111; color: #fff;">
                <h1>500 - Internal Server Error</h1>
                <p>An error occurred while checking admin privileges.</p>
                <a href="/dashboard" style="color: #3b82f6;">Return to Dashboard</a>
            </body>
            </html>
        `);
    }
}

app.get('/login', (req, res) => {
    res.render('login', { error: null });
});


app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await mongo.findDocumentByKey('username', username, config.mongo_db_collection);

        if (!user) {
            return res.render('login', { error: 'Invalid username or password' });
        }

        // Check if user is banned
        if (user.banned) {
            const reason = user.banReason || 'No reason provided';
            return res.render('login', { error: `Your account is banned. Reason: ${reason}` });
        }

        if (!await bcrypt.compare(password, user.password)) {
            return res.render('login', { error: 'Invalid username or password' });
        }

        if (await globalThis.isUserExpired(config, mongo, user)) {
            return res.render('login', { error: `Account expired on ${user.expiry || 'Unknown'}. Contact @${config.owner_name} for renewal.` });
        }

        req.session.username = username;
        req.session.plaintextPassword = password; // Store plaintext password temporarily
        req.session.save(err => {
            if (err) {
                console.error('Session save error:', err);
                return res.render('login', { error: 'Internal server error' });
            }
            res.redirect('/dashboard');
        });

    } catch (err) {
        console.error('Login error:', err);
        res.render('login', { error: 'Internal server error' });
    }
});
app.get('/', (req, res) => {
    res.render('index', { error: null });
});


app.get('/dashboard', isAuthenticated, async (req, res) => {
    res.redirect('/dashboard/user');
});

app.get('/dashboard/user', isAuthenticated, async (req, res) => {
    try {
        const user = await mongo.findDocumentByKey('username', req.session.username, config.mongo_db_collection);
        res.render('dashboard_user', {
            user,
            config,
            message: null,
            error: null
        });
    } catch (err) {
        console.error('Dashboard user error:', err);
        res.render('dashboard_user', {
            user: {},
            config,
            message: null,
            error: 'Failed to load user data'
        });
    }
});

app.get('/dashboard/attack', isAuthenticated, async (req, res) => {
    try {
        const user = await mongo.findDocumentByKey('username', req.session.username, config.mongo_db_collection);
        const attackMethods = await loadMethods();
        
        // Get active attacks for current user (with safe check)
        let activeAttacks = [];
        if (attackHandler && attackHandler.activeAttacks) {
            try {
                activeAttacks = Array.from(attackHandler.activeAttacks.values())
                    .filter(attack => attack.username === user.username)
                    .map(attack => ({
                        id: attack.id,
                        username: attack.username,
                        method: attack.method,
                        host: attack.params.host,
                        port: attack.params.port,
                        time: attack.params.time,
                        startTime: new Date(attack.startTime).toISOString(),
                        remainingTime: Math.max(0, Math.ceil((attack.startTime + attack.params.time * 1000 - Date.now()) / 1000))
                    }));
            } catch (err) {
                console.error('Error fetching active attacks:', err);
                activeAttacks = [];
            }
        }
        
        res.render('dashboard_attack', {
            user,
            attackMethods,
            activeAttacks,
            config,
            message: null,
            error: null
        });
    } catch (err) {
        console.error('Dashboard attack error:', err);
        res.render('dashboard_attack', {
            user: {},
            attackMethods: await loadMethods(),
            activeAttacks: [],
            config,
            message: null,
            error: 'Failed to load attack form'
        });
    }
});

// API endpoint for fetching active attacks (AJAX)
app.get('/api/active-attacks', isAuthenticated, async (req, res) => {
    try {
        const user = await mongo.findDocumentByKey('username', req.session.username, config.mongo_db_collection);
        
        let activeAttacks = [];
        if (attackHandler && attackHandler.activeAttacks) {
            try {
                activeAttacks = Array.from(attackHandler.activeAttacks.values())
                    .filter(attack => attack.username === user.username)
                    .map(attack => ({
                        id: attack.id,
                        username: attack.username,
                        method: attack.method,
                        host: attack.params.host,
                        port: attack.params.port,
                        time: attack.params.time,
                        startTime: new Date(attack.startTime).toISOString(),
                        remainingTime: Math.max(0, Math.ceil((attack.startTime + attack.params.time * 1000 - Date.now()) / 1000))
                    }));
            } catch (err) {
                console.error('Error fetching active attacks:', err);
            }
        }
        
        res.json({ success: true, activeAttacks });
    } catch (err) {
        console.error('API active attacks error:', err);
        res.json({ success: false, activeAttacks: [] });
    }
});

app.get('/dashboard/methods', isAuthenticated, async (req, res) => {
    try {
        const user = await mongo.findDocumentByKey('username', req.session.username, config.mongo_db_collection);
        const attackMethods = await loadMethods();
        res.render('dashboard_methods', {
            user,
            attackMethods,
            config,
            message: null,
            error: null
        });
    } catch (err) {
        console.error('Dashboard methods error:', err);
        res.render('dashboard_methods', {
            user: {},
            attackMethods: await loadMethods(),
            config,
            message: null,
            error: 'Failed to load methods'
        });
    }
});

app.get('/dashboard/logs', isAuthenticated, async (req, res) => {
    try {
        const user = await mongo.findDocumentByKey('username', req.session.username, config.mongo_db_collection);
        const username = req.session.username;
        let attackLogs = [];
        const logFilePath = '/root/ZOPZCNC/logs/attack_sent.log';

        try {
            // Read the log file
            const logData = await fsv2.readFile(logFilePath, 'utf-8');
            // Parse each line, expecting [timestamp] Sent attack {json}
            attackLogs = logData
                .split('\n')
                .filter(line => line.trim() !== '') // Skip empty lines
                .map(line => {
                    const match = line.match(/\[([^\]]+)\] Sent attack (\{.*\})/);
                    if (match) {
                        try {
                            const jsonData = JSON.parse(match[2]);
                            return jsonData;
                        } catch (err) {
                            console.warn('Failed to parse log entry:', line, err.message);
                            return null;
                        }
                    }
                    return null;
                })
                .filter(entry => entry && entry.user === username); // Filter by logged-in user
        } catch (err) {
            console.warn('Failed to read attack logs:', err.message);
            attackLogs = [];
        }

        res.render('dashboard_logs', { 
            user: user || { username },
            attackLogs, 
            config, 
            message: null, 
            error: attackLogs.length === 0 ? 'No attack logs found' : null
        });
    } catch (err) {
        console.error('Dashboard logs error:', err);
        res.render('dashboard_logs', { 
            user: await mongo.findDocumentByKey('username', req.session.username, config.mongo_db_collection) || { username: req.session.username }, 
            attackLogs: [], 
            config, 
            message: null, 
            error: 'Failed to load attack logs'
        });
    }
});

app.get('/plan', async (req, res) => {
    try {
        const { username, password } = req.query;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const user = await mongo.findDocumentByKey('username', username, config.mongo_db_collection);
        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const planFields = [
            "plan", "planType", "expiry", "maxTime",
            "concurrents", "vip", "admin", "reseller",
            "api", "spambypass", "blacklistbypass",
            "homeholder", "botnet", "selectedTheme"
        ];

        const planInfo = { username: user.username };
        planFields.forEach(field => {
            if (user.hasOwnProperty(field)) planInfo[field] = user[field];
        });

        res.json({ success: true, data: planInfo });

    } catch (err) {
        console.error('Plan API error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/viewplan', isAuthenticated, async (req, res) => {
    try {
        const user = await mongo.findDocumentByKey('username', req.session.username, config.mongo_db_collection);
        res.render('viewplan', {
            user,
            config,
            message: null,
            error: null
        });
    } catch (err) {
        console.error('View plan error:', err);
        res.render('viewplan', {
            user: {},
            config,
            message: null,
            error: 'Failed to load plan data'
        });
    }
});
app.post('/attack', isAuthenticated, async (req, res) => {
    try {
        const { host, port, time, method, len } = req.body;
        const username = req.session.username;
        const plaintextPassword = req.session.plaintextPassword;

        if (!username) {
            console.error('Attack submission error: Missing session username', { ip: req.ip });
            return res.redirect('/login');
        }

        if (!plaintextPassword) {
            console.error('Attack submission error: Missing plaintext password in session', { username, ip: req.ip });
            return res.render('dashboard_attack', {
                user: {},
                attackMethods: await loadMethods(),
                config,
                message: null,
                error: 'Session expired or password not available. Please log in again.'
            });
        }

        const user = await mongo.findDocumentByKey('username', username, config.mongo_db_collection);
        if (!user) {
            console.error('Attack submission error: User not found', { username });
            return res.render('dashboard_attack', {
                user: {},
                attackMethods: await loadMethods(),
                config,
                message: null,
                error: 'User not found'
            });
        }

        if (!user.password) {
            console.error('Attack submission error: No password set for user', { username });
            return res.render('dashboard_attack', {
                user,
                attackMethods: await loadMethods(),
                config,
                message: null,
                error: 'User account has no password set'
            });
        }

        //if (!isValidHost(host)) {
        //    console.error('Attack submission error: Invalid host', { host, username });
        //    const attackMethods = await loadMethods();
        //    return res.render('dashboard_attack', {
        //        user,
        //        attackMethods,
        //        config,
        //       message: null,
                error: 'Invalid host. Must be IPv4 or valid domain name'
        //    });
        //}

        if (await globalThis.isUserExpired(config, mongo, user)) {
            console.error('Attack submission error: User account expired', { username, expiry: user.expiry });
            const attackMethods = await loadMethods();
            return res.render('dashboard_attack', {
                user,
                attackMethods,
                config,
                message: null,
                error: `Account expired on ${user.expiry || 'Unknown'}. Contact @${config.owner_name} for renewal.`
            });
        }

        // Validate attack method
        const methods = await loadMethods();
        if (!methods.some(m => m.name === method.toLowerCase())) {
            console.error('Attack submission error: Invalid or disabled method', { method, username });
            return res.render('dashboard_attack', {
                user,
                attackMethods: methods,
                config,
                message: null,
                error: 'Invalid or disabled attack method'
            });
        }

        // Strip protocol from host
      const cleanHost = host.replace(/^(https?:\/\/)?(\d{1,3}\.){3}\d{1,3}/, match => {
  // Remove the protocol if it exists, keep the rest
  return host.replace(/^https?:\/\//, '');
});

        // Construct attack URL with plaintext password from session
        const attackUrl = `${config.Telegram_attackdomain}${config.Web_Endpoint}?username=${encodeURIComponent(username)}&password=${encodeURIComponent(plaintextPassword)}&host=${cleanHost}&port=${encodeURIComponent(port)}&time=${encodeURIComponent(time)}&method=${encodeURIComponent(method)}&len=${encodeURIComponent(len || 1)}`;
        console.log('Sending attack request:', attackUrl);

        const result = await new Promise((resolve, reject) => {
            const req = https.get(attackUrl, { timeout: 10000 }, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        console.error('API response error:', `HTTP ${res.statusCode}: ${data || 'No response body'}`, { username });
                        reject(new Error(`HTTP ${res.statusCode}: ${data || 'No response'}`));
                        return;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        console.log('Attack API response:', parsed);
                        if (parsed.error || !parsed.target) {
                            reject(new Error(parsed.error || 'No target in response'));
                        } else {
                            resolve(parsed);
                        }
                    } catch (e) {
                        console.error('Attack API parse error:', e.message, { data, username });
                        reject(new Error('Invalid JSON response'));
                    }
                });
            });
            req.on('timeout', () => {
                req.destroy();
                console.error('Attack API request timed out', { username });
                reject(new Error('Request timed out'));
            });
            req.on('error', (err) => {
                console.error('Attack API request error:', err.message, { username });
                reject(err);
            });
            req.end();
        });

        if (config.attack_logs && result?.target) {
            globalThis.logToFile(globalThis.LogPaths.AttacksSent, 'Sent attack', {
                user: username,
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
            });
        }

        const message = result.error ? result.error : 'Attack sent successfully';
        const attackMethods = await loadMethods();
        res.render('dashboard_attack', {
            user,
            attackMethods,
            config,
            message,
            error: result.error ? message : null
        });
    } catch (err) {
        console.error('Attack submission error:', err.message, { stack: err.stack, username: req.session.username, ip: req.ip });
        const user = await mongo.findDocumentByKey('username', req.session.username, config.mongo_db_collection).catch(() => ({}));
        const attackMethods = await loadMethods();
        res.render('dashboard_attack', {
            user,
            attackMethods,
            config,
            message: null,
            error: 'Internal server error: ' + (err.message || 'Unknown error')
        });
    }
});
app.get(configs.Attack_Endpoint, async (req, res) => {
    try {
        const { username, password, host, port, time, method, len, concurrents } = req.query;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        //if (!isValidHost(host)) {
        //    return res.status(400).json({ error: 'Invalid host. Must be IPv4 or valid domain name' });
        //}

        const user = await mongo.findDocumentByKey('username', username, config.mongo_db_collection);
        if (!user) {
            return res.status(401).json({ error: 'Invalid username' });
        }

        if (!user.password) {
            console.error(`No password set for user: ${username}`);
            return res.status(500).json({ error: 'User account has no password set' });
        }

        if (!await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        if (!user.api) {
            return res.status(403).json({ error: 'User has no access to API' });
        }

        if (await globalThis.isUserExpired(config, mongo, user)) {
            return res.status(401).json({
                error: `Account expired on ${user.expiry || 'Unknown'}. Contact @${config.owner_name} for renewal.`
            });
        }

        const concurrentCount = parseInt(concurrents) || 1;
        if (concurrentCount < 1 || concurrentCount > 10) { // Limiting to 10 to prevent abuse
            return res.status(400).json({ error: 'Concurrents must be between 1 and 10' });
        }

        const attackPromises = [];
        for (let i = 0; i < concurrentCount; i++) {
            attackPromises.push(attackHandler.processRequest(method, {
                host,
                port: parseInt(port),
                time: parseInt(time),
                len: parseInt(len) || 1
            }, user));
        }

        const results = await Promise.all(attackPromises);

        // Log each successful attack
        if (config.attack_logs) {
            results.forEach((result, index) => {
                if (result?.target) {
                    globalThis.logToFile(globalThis.LogPaths.AttacksSent, 'Sent attack', {
                        user: username,
                        target: result.target.host,
                        port: result.target.port,
                        time: result.target.duration,
                        method: result.target.method,
                        concurrent: index + 1,
                        totalConcurrents: concurrentCount,
                        datetime: new Date(result.target.time_sent).toLocaleString(undefined, {
                            month: "numeric",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: true
                        })
                    });
                }
            });
        }

        // Return the first error found or the first result if no errors
        const errorResult = results.find(result => result.error);
        return res.status(errorResult ? 400 : 200).json(errorResult || results[0]);
    } catch (err) {
        console.error('Route error:', err);
        return res.status(500).json({ error: 'Internal server error: ' + err.message });
    }
});
async function loadMethods() {
    try {
        const raw = await fsv2.readFile(methodsConfig, 'utf8').catch(() => '{}');
        const methodsData = JSON.parse(raw);
        return Object.entries(methodsData).map(([key, value]) => ({
            name: key.toLowerCase(),
            vip: Boolean(value.vip)
        }));
    } catch (e) {
        console.error('Error loading methods config:', e.message);
        return [];
    }
}

app.get('/api/methods', async (req, res) => {
    const methods = await loadMethods();
    res.json({ success: true, methods });
});

app.get('/api-docs', isAuthenticated, async (req, res) => {
    try {
        const user = await mongo.findDocumentByKey('username', req.session.username, config.mongo_db_collection);
        res.render('api-docs', {
            user,
            config,
            message: null,
            error: null
        });
    } catch (err) {
        console.error('API docs error:', err);
        res.render('api-docs', {
            user: {},
            config,
            message: null,
            error: 'Failed to load API documentation'
        });
    }
});

// Admin API endpoint (legacy)
app.get('/admin/ongoing', async (req, res) => {
    try {
        const { username, password } = req.query;
        const adminDoc = await mongo.findDocumentByKey('username', username, config.mongo_db_collection);
        if (!adminDoc || !adminDoc.admin || !await bcrypt.compare(password, adminDoc.password)) {
            return res.json({ success: false, message: 'Function is admin only' });
        }
        const ongoingAttacks = Array.from(attackHandler.activeAttacks.values()).map(attack => ({
            id: attack.id,
            username: attack.username,
            method: attack.method,
            host: attack.params.host,
            port: attack.params.port,
            time: attack.params.time,
            startTime: new Date(attack.startTime).toISOString(),
            remainingTime: Math.max(0, Math.ceil((attack.startTime + attack.params.time * 1000 - Date.now()) / 1000))
        }));
        return res.json({ success: true, ongoingAttacks });
    } catch (err) {
        console.error('Admin ongoing attacks error:', err.message, { stack: err.stack });
        return res.status(500).json({ success: false, message: 'Internal server error: ' + err.message });
    }
});

// Admin Panel Routes
app.get('/admin', isAuthenticated, isAdmin, async (req, res) => {
    res.redirect('/admin/dashboard');
});

app.get('/admin/dashboard', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const user = req.adminUser;
        const allUsers = await mongo.getCollection(config.mongo_db_collection).find({}).toArray();
        const totalUsers = allUsers.length;
        const activeUsers = allUsers.filter(u => !u.banned && !globalThis.isUserExpired?.(config, mongo, u)).length;
        const bannedUsers = allUsers.filter(u => u.banned).length;
        const expiredUsers = allUsers.filter(u => !u.banned && globalThis.isUserExpired?.(config, mongo, u)).length;
        
        const ongoingAttacks = Array.from(attackHandler.activeAttacks.values()).map(attack => ({
            id: attack.id,
            username: attack.username,
            method: attack.method,
            host: attack.params.host,
            port: attack.params.port,
            time: attack.params.time,
            startTime: new Date(attack.startTime).toISOString(),
            remainingTime: Math.max(0, Math.ceil((attack.startTime + attack.params.time * 1000 - Date.now()) / 1000))
        }));

        res.render('admin_dashboard', {
            user,
            config,
            stats: {
                totalUsers,
                activeUsers,
                bannedUsers,
                expiredUsers,
                ongoingAttacks: ongoingAttacks.length
            },
            ongoingAttacks,
            message: null,
            error: null
        });
    } catch (err) {
        console.error('Admin dashboard error:', err);
        res.render('admin_dashboard', {
            user: req.adminUser,
            config,
            stats: { totalUsers: 0, activeUsers: 0, bannedUsers: 0, expiredUsers: 0, ongoingAttacks: 0 },
            ongoingAttacks: [],
            message: null,
            error: 'Failed to load dashboard data'
        });
    }
});

app.get('/admin/users', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const user = req.adminUser;
        const allUsers = await mongo.getCollection(config.mongo_db_collection).find({}).toArray();
        
        // Check expiration status for each user (isUserExpired is async)
        const usersWithStatus = await Promise.all(allUsers.map(async (u) => {
            const userObj = { ...u };
            if (!u.banned && globalThis.isUserExpired) {
                try {
                    userObj.isExpired = await globalThis.isUserExpired(config, mongo, u);
                } catch (err) {
                    userObj.isExpired = false;
                }
            } else {
                userObj.isExpired = false;
            }
            return userObj;
        }));
        
        // Sort users by username
        usersWithStatus.sort((a, b) => (a.username || '').localeCompare(b.username || ''));
        
        const message = req.query.message || null;
        const error = req.query.error || null;
        
        res.render('admin_users', {
            user,
            config,
            users: usersWithStatus,
            message,
            error
        });
    } catch (err) {
        console.error('Admin users error:', err);
        res.render('admin_users', {
            user: req.adminUser,
            config,
            users: [],
            message: null,
            error: 'Failed to load users'
        });
    }
});

app.get('/admin/attacks', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const user = req.adminUser;
        const ongoingAttacks = Array.from(attackHandler.activeAttacks.values()).map(attack => ({
            id: attack.id,
            username: attack.username,
            method: attack.method,
            host: attack.params.host,
            port: attack.params.port,
            time: attack.params.time,
            startTime: new Date(attack.startTime).toISOString(),
            remainingTime: Math.max(0, Math.ceil((attack.startTime + attack.params.time * 1000 - Date.now()) / 1000))
        }));

        res.render('admin_attacks', {
            user,
            config,
            ongoingAttacks,
            message: null,
            error: null
        });
    } catch (err) {
        console.error('Admin attacks error:', err);
        res.render('admin_attacks', {
            user: req.adminUser,
            config,
            ongoingAttacks: [],
            message: null,
            error: 'Failed to load ongoing attacks'
        });
    }
});

// Admin User Management Routes
app.get('/admin/users/:username/edit', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const adminUser = req.adminUser;
        const targetUsername = req.params.username;
        const targetUser = await mongo.findDocumentByKey('username', targetUsername, config.mongo_db_collection);
        
        if (!targetUser) {
            return res.redirect('/admin/users?error=User not found');
        }
        
        res.render('admin_user_edit', {
            user: adminUser,
            targetUser,
            config,
            message: null,
            error: null
        });
    } catch (err) {
        console.error('Admin user edit error:', err);
        res.redirect('/admin/users?error=Failed to load user');
    }
});

app.post('/admin/users/:username/edit', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const targetUsername = req.params.username;
        const targetUser = await mongo.findDocumentByKey('username', targetUsername, config.mongo_db_collection);
        
        if (!targetUser) {
            return res.redirect('/admin/users?error=User not found');
        }
        
        const updateData = {};
        
        // Update fields if provided
        if (req.body.maxTime) updateData.maxTime = parseInt(req.body.maxTime);
        if (req.body.concurrents) updateData.concurrents = parseInt(req.body.concurrents);
        if (req.body.expiry) updateData.expiry = req.body.expiry;
        if (req.body.role) updateData.role = req.body.role;
        if (req.body.cooldown !== undefined) updateData.cooldown = parseInt(req.body.cooldown) || 0;
        
        // Boolean fields
        updateData.admin = req.body.admin === 'true' || req.body.admin === 'on';
        updateData.reseller = req.body.reseller === 'true' || req.body.reseller === 'on';
        updateData.api = req.body.api === 'true' || req.body.api === 'on';
        updateData.vip = req.body.vip === 'true' || req.body.vip === 'on';
        updateData.botnet = req.body.botnet === 'true' || req.body.botnet === 'on';
        updateData.homeholder = req.body.homeholder === 'true' || req.body.homeholder === 'on';
        updateData.spambypass = req.body.spambypass === 'true' || req.body.spambypass === 'on';
        updateData.blacklistbypass = req.body.blacklistbypass === 'true' || req.body.blacklistbypass === 'on';
        
        // Update password if provided
        if (req.body.password && req.body.password.trim() !== '') {
            updateData.password = await bcrypt.hash(req.body.password, 10);
        }
        
        await mongo.updateDocumentByKey('username', targetUsername, updateData, config.mongo_db_collection);
        
        res.redirect(`/admin/users?message=User ${targetUsername} updated successfully`);
    } catch (err) {
        console.error('Admin user update error:', err);
        res.redirect(`/admin/users?error=Failed to update user: ${err.message}`);
    }
});

app.post('/admin/users/:username/ban', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const targetUsername = req.params.username;
        const banReason = req.body.reason || 'No reason provided';
        
        const targetUser = await mongo.findDocumentByKey('username', targetUsername, config.mongo_db_collection);
        if (!targetUser) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        const isBanned = !targetUser.banned;
        await mongo.updateDocumentByKey('username', targetUsername, {
            banned: isBanned,
            banReason: isBanned ? banReason : null
        }, config.mongo_db_collection);
        
        res.json({ 
            success: true, 
            message: isBanned ? `User ${targetUsername} has been banned` : `User ${targetUsername} has been unbanned`,
            banned: isBanned
        });
    } catch (err) {
        console.error('Admin ban user error:', err);
        res.json({ success: false, message: 'Failed to update ban status' });
    }
});

app.post('/admin/users/:username/delete', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const targetUsername = req.params.username;
        const adminUser = req.adminUser;
        
        // Prevent deleting own account
        if (targetUsername === adminUser.username) {
            return res.json({ success: false, message: 'Cannot delete your own account' });
        }
        
        const targetUser = await mongo.findDocumentByKey('username', targetUsername, config.mongo_db_collection);
        if (!targetUser) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        await mongo.getCollection(config.mongo_db_collection).deleteOne({ username: targetUsername });
        
        res.json({ success: true, message: `User ${targetUsername} has been deleted` });
    } catch (err) {
        console.error('Admin delete user error:', err);
        res.json({ success: false, message: 'Failed to delete user' });
    }
});

app.get('/admin/logs', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const user = req.adminUser;
        let attackLogs = [];
        const logFilePath = '/root/ZOPZCNC/logs/attack_sent.log';

        try {
            const logData = await fsv2.readFile(logFilePath, 'utf-8');
            attackLogs = logData
                .split('\n')
                .filter(line => line.trim() !== '')
                .map(line => {
                    const match = line.match(/\[([^\]]+)\] Sent attack (\{.*\})/);
                    if (match) {
                        try {
                            const jsonData = JSON.parse(match[2]);
                            return jsonData;
                        } catch (err) {
                            console.warn('Failed to parse log entry:', line, err.message);
                            return null;
                        }
                    }
                    return null;
                })
                .filter(entry => entry !== null)
                .reverse()
                .slice(0, 500); // Limit to last 500 entries
        } catch (err) {
            console.warn('Failed to read attack logs:', err.message);
            attackLogs = [];
        }

        res.render('admin_logs', {
            user,
            config,
            attackLogs,
            message: null,
            error: null
        });
    } catch (err) {
        console.error('Admin logs error:', err);
        res.render('admin_logs', {
            user: req.adminUser,
            config,
            attackLogs: [],
            message: null,
            error: 'Failed to load logs'
        });
    }
});

// Admin API endpoints
app.get('/api/admin/ongoing', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const ongoingAttacks = Array.from(attackHandler.activeAttacks.values()).map(attack => ({
            id: attack.id,
            username: attack.username,
            method: attack.method,
            host: attack.params.host,
            port: attack.params.port,
            time: attack.params.time,
            startTime: new Date(attack.startTime).toISOString(),
            remainingTime: Math.max(0, Math.ceil((attack.startTime + attack.params.time * 1000 - Date.now()) / 1000))
        }));
        return res.json({ success: true, ongoingAttacks });
    } catch (err) {
        console.error('Admin ongoing attacks API error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error: ' + err.message });
    }
});

async function StartExpressServer(_config, _mongo, _attackHandler) {
    config = _config;
    mongo = _mongo;
    attackHandler = _attackHandler;

    try {
        const rawConfig = await fs.promises.readFile(mainConfig, 'utf8');
        config = { ...config, ...JSON.parse(rawConfig) };
    } catch (err) {
        console.error('Error loading main config:', err.message);
    }

    let server;
    if (!config.api.cert_path || !config.api.key_path) {
        server = app.listen(config.api.port, '0.0.0.0', () => {
            const datetime = new Date();
            const formatted = `${datetime.getFullYear()}-${String(datetime.getMonth() + 1).padStart(2, '0')}-${String(datetime.getDate()).padStart(2, '0')} ${String(datetime.getHours()).padStart(2, '0')}:${String(datetime.getMinutes()).padStart(2, '0')}:${String(datetime.getSeconds()).padStart(2, '0')}`;
            console.log(`${formatted} [OK] \x1b[48;5;238m\x1b[97mExpress server listening on port ${config.api.port}\x1b[0m`);
        });
    } else {
        server = https.createServer({
            cert: fs.readFileSync(config.api.cert_path),
            key: fs.readFileSync(config.api.key_path)
        }, app).listen(config.api.port, '0.0.0.0', () => {
            const datetime = new Date();
            const formatted = `${datetime.getFullYear()}-${String(datetime.getMonth() + 1).padStart(2, '0')}-${String(datetime.getDate()).padStart(2, '0')} ${String(datetime.getHours()).padStart(2, '0')}:${String(datetime.getMinutes()).padStart(2, '0')}:${String(datetime.getSeconds()).padStart(2, '0')}`;
            console.log(`${formatted} [OK] \x1b[48;5;238m\x1b[97mExpress server with SSL listening on port ${config.api.port}\x1b[0m`);
        });
    }

    server.on('error', (err) => {
        console.error('Server error:', err);
    });
}

process.on('uncaughtException', (err) => {
    if (err.code === 'ECONNRESET') {
        console.warn('⚠️ Connection reset by peer (ignored).');
    } else {
        console.error('Unhandled exception:', err);
    }
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
});

globalThis.StartExpressServer = StartExpressServer;