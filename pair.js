/* KADIIYA MINI BOT - MULTI SESSION SUPPORT
  DEVELOPED BY CHAMOD TECH OFC
  FULLY ENC AND PRIVET SOURCE CODE    
  Code Ussai #akak - Thawa #akada balanne                                                                             
*/

const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const {
    exec
} = require('child_process');
const { sms } = require("./msg");
const router = express.Router();
const pino = require('pino');
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const yts = require('yt-search');
const os = require('os');
const fecth = require('node-fetch');
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
ffmpeg.setFfmpegPath(ffmpegPath);
  const images = [
    'https://files.catbox.moe/ooq3ln.jpg'
  ]; 

const akira = images[Math.floor(Math.random() * images.length)];

const {
    default: makeWASocket,
    makeCacheableSignalKeyStore,
    useMultiFileAuthState,
    DisconnectReason,
    downloadMediaMessage,
    generateForwardMessageContent,
    prepareWAMessageMedia,
    fetchLatestBaileysVersion, 
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    extractMessageContent, 
    jidDecode,
    MessageRetryMap,
    jidNormalizedUser, 
    proto,
    getContentType,
    areJidsSameUser,
    generateWAMessage, 
    delay, 
    Browsers
} = require("baileys");

const config = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    MODE: 'public',
    PREFIX: '.',
    MAX_RETRIES: 3,
    ADMIN_LIST_PATH: './admin.json',
    AKIRA_IMG: 'https://files.catbox.moe/ooq3ln.jpg',
    NEWSLETTER_JID: '120363419619460838@newsletter',
    NEWSLETTER_LIST: [
        '120363425584831057@newsletter',
        '120363422562980426@newsletter'
    ],
    NEWSLETTER_MESSAGE_ID: '428',
    OTP_EXPIRY: 300000,
    OWNER_NUMBER: '94763353368',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029Vb69K9665yDEFt3DRR0D'
};

const activeSockets = new Map();
const socketCreationTime = new Map();
const socketHandlersMap = new Map();
const SESSION_BASE_PATH = './session';
const NUMBER_LIST_PATH = './numbers.json';

const channelInfoCache = {
    jid: null,
    name: null,
    subscribers: null,
    link: config.CHANNEL_LINK,
    lastFetched: 0
};
const CHANNEL_CACHE_TTL = 10 * 60 * 1000;

function getChannelInviteCode(link) {
    if (!link) return null;
    const match = link.match(/whatsapp\.com\/channel\/([A-Za-z0-9]+)/i);
    return match ? match[1] : null;
}

function extractSubscriberCount(metadata) {
    if (!metadata) return null;
    return (
        metadata.subscribers ??
        metadata.subscribers_count ??
        metadata.subscriberCount ??
        metadata.viewer_metadata?.subscribers ??
        metadata?.metadata?.subscribers_count ??
        null
    );
}

async function resolveAndFollowChannel(socket, forceRefresh = false) {
    try {
        const now = Date.now();
        if (!forceRefresh && channelInfoCache.jid && (now - channelInfoCache.lastFetched) < CHANNEL_CACHE_TTL) {
            return channelInfoCache;
        }

        const inviteCode = getChannelInviteCode(config.CHANNEL_LINK);
        if (!inviteCode) return channelInfoCache;

        const metadata = await socket.newsletterMetadata('invite', inviteCode);
        if (!metadata) return channelInfoCache;

        channelInfoCache.jid = metadata.id || metadata.jid || channelInfoCache.jid;
        channelInfoCache.name = metadata.name || metadata.state?.name || channelInfoCache.name;
        channelInfoCache.subscribers = extractSubscriberCount(metadata);
        channelInfoCache.lastFetched = now;

        if (channelInfoCache.jid) {
            try {
                await socket.newsletterFollow(channelInfoCache.jid);
            } catch (followErr) {
                console.log('Channel follow error:', followErr.message);
            }
        }

        return channelInfoCache;
    } catch (error) {
        console.log('resolveAndFollowChannel error:', error.message);
        return channelInfoCache;
    }
}

const SessionSchema = new mongoose.Schema({
    number: {
        type: String,
        unique: true,
        required: true
    },
    creds: {
        type: Object,
        required: true
    },
    config: {
        type: Object
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

const Session = mongoose.model('SessionNew', SessionSchema); 

async function connectMongoDB() {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://maliquotes6_db_user:FlDox4Qcie9JUzZ9@cluster0.bbsrc3v.mongodb.net/?appName=Cluster0';
        await mongoose.connect(mongoUri, {
            bufferCommands: false,
            serverSelectionTimeoutMS: 5000 
        });
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('MongoDB connection failed:', error);
        process.exit(1);
    }
}
connectMongoDB();

if (!fs.existsSync(SESSION_BASE_PATH)) {
    fs.mkdirSync(SESSION_BASE_PATH, {
        recursive: true
    });
}

function initialize() {
    activeSockets.clear();
    socketCreationTime.clear();
    console.log('Cleared active sockets and creation times on startup');
}

async function uploadToCatbox(stream, fileName) {
    try {
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', stream, fileName);

        const res = await axios.post(
            'https://catbox.moe/user/api.php',
            form,
            { headers: form.getHeaders(), timeout: 0 }
        );

        if (!res.data.startsWith('https://')) return null;
        return res.data.trim();
    } catch {
        return null;
    }
}

async function saveMediaToCatbox(msg) {
    try {
        const type = Object.keys(msg.message)[0];
        const mediaMap = {
            imageMessage: 'image',
            videoMessage: 'video',
            audioMessage: 'audio',
            documentMessage: 'document'
        };

        if (!mediaMap[type]) return null;

        const mediaMsg = msg.message[type];
        const size = mediaMsg.fileLength || 0;
        
        if (size > 100 * 1024 * 1024) return null;

        const stream = await downloadContentFromMessage(
            mediaMsg,
            mediaMap[type]
        );

        const ext =
            type === 'imageMessage' ? 'jpg' :
            type === 'videoMessage' ? 'mp4' :
            type === 'audioMessage' ? 'opus' :
            'bin';

        return await uploadToCatbox(stream, `${msg.key.id}.${ext}`);
    } catch {
        return null;
    }
}

function setupNewsletterHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key) return;

        const jid = message.key.remoteJid;
        if (jid !== config.NEWSLETTER_JID) return;

        try {
            const emojis = ['🎀', '🍬', '👽', '🌺', '🍓', '🍫', '🫐', '🥷'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            const messageId = message.key.server_id || message.newsletterServerId;

            if (!messageId) return;

            await socket.newsletterReactMessage(jid, messageId.toString(), randomEmoji);
        } catch (error) {
            console.error('⚠️ Newsletter reaction failed:', error.message);
        }
    });
}

async function autoReconnectOnStartup() {
    try {
        let numbers = [];
        if (fs.existsSync(NUMBER_LIST_PATH)) {
            numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH, 'utf8'));
        }

        const sessions = await Session.find({}, 'number').lean();
        const mongoNumbers = sessions.map(s => s.number);
        numbers = [...new Set([...numbers, ...mongoNumbers])];

        for (const number of numbers) {
            const sanitized = number.replace(/[^0-9]/g, '');
            if (activeSockets.has(sanitized)) continue;

            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            try {
                await EmpirePair(sanitized, mockRes);
            } catch (error) {
                console.error(`❌ Failed to reconnect ${sanitized}:`, error);
            }
            await delay(1500);
        }
    } catch (error) {
        console.error('Auto-reconnect on startup failed:', error);
    }
}

(async () => {
    await initialize();
    setTimeout(autoReconnectOnStartup, 5000); 
})();

function formatMessage(title, content, footer) {
    return `*${title}*\n\n${content}\n\n> *${footer}*`;
}

function getSriLankaTimestamp() {
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}

async function setupMessageHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;
    });
} 

function setupAutoRestart(socket, number) {
    const id = number;
    let reconnecting = false;

    socket.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
        if (connection === 'open') {
            reconnecting = false;
            return;
        }

        if (connection !== 'close' || reconnecting) return;
        reconnecting = true;

        const statusCode = lastDisconnect?.error?.output?.statusCode;

        if (statusCode === 401) {
            await destroySocket(id);
            await deleteSession(id);
            return;
        }

        await delay(2000);
        await destroySocket(id);

        const mockRes = {
            headersSent: true,
            send() {},
            status() { return this }
        };

        try {
            await EmpirePair(id, mockRes);
        } catch (e) {
            console.error('Reconnect failed:', e);
        }
        reconnecting = false;
    });
}

async function destroySocket(id) {
    try {
        const data = activeSockets.get(id);
        if (data?.socket) {
            data.socket.ev.removeAllListeners();
            data.socket.ws?.close();
        }
    } catch (e) {
        console.error('Destroy socket error:', e);
    }
    activeSockets.delete(id);
    socketCreationTime.delete(id);
}

async function saveSession(number, creds) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        await Session.findOneAndUpdate({ number: sanitizedNumber }, { creds, updatedAt: new Date() }, { upsert: true });
        const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        fs.ensureDirSync(sessionPath);
        fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(creds, null, 2));
        let numbers = [];
        if (fs.existsSync(NUMBER_LIST_PATH)) {
            numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH, 'utf8'));
        }
        if (!numbers.includes(sanitizedNumber)) {
            numbers.push(sanitizedNumber);
            fs.writeFileSync(NUMBER_LIST_PATH, JSON.stringify(numbers, null, 2));
        }
    } catch (error) {
        console.error(`Failed to save session:`, error);
    }
}

async function restoreSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const session = await Session.findOne({ number: sanitizedNumber });
        if (!session) return null;
        if (!session.creds || !session.creds.me || !session.creds.me.id) {
            await deleteSession(sanitizedNumber);
            return null;
        }
        const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        fs.ensureDirSync(sessionPath);
        fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(session.creds, null, 2));
        return session.creds;
    } catch (error) {
        return null;
    }
}

async function deleteSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        await Session.deleteOne({ number: sanitizedNumber });
        const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath);
        if (fs.existsSync(NUMBER_LIST_PATH)) {
            let numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH, 'utf8'));
            numbers = numbers.filter(n => n !== sanitizedNumber);
            fs.writeFileSync(NUMBER_LIST_PATH, JSON.stringify(numbers, null, 2));
        }
    } catch (error) {}
}

async function loadUserConfig(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const configDoc = await Session.findOne({ number: sanitizedNumber }, 'config');
        return configDoc?.config || { ...config };
    } catch (error) {
        return { ...config };
    }
}

async function updateUserConfig(number, newConfig) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        await Session.findOneAndUpdate({ number: sanitizedNumber }, { config: newConfig, updatedAt: new Date() }, { upsert: true });
    } catch (error) {
        throw error;
    }
}

async function setupStatusHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg?.key || msg.key.remoteJid !== 'status@broadcast' || !msg.key.participant) return;

        const botJid = jidNormalizedUser(socket.user.id);
        if (msg.key.participant === botJid) return;

        const sanitizedNumber = botJid.split('@')[0].replace(/[^0-9]/g, '');
        const sessionConfig = activeSockets.get(sanitizedNumber)?.config || config;

        try {
            if (sessionConfig.AUTO_VIEW_STATUS === 'true') {
                await socket.readMessages([msg.key]);
            }
            if (sessionConfig.AUTO_LIKE_STATUS === 'true') {
                const emojis = sessionConfig.AUTO_LIKE_EMOJI || ['🎀'];
                const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                await socket.sendMessage(msg.key.remoteJid, { react: { text: randomEmoji, key: msg.key } }, { statusJidList: [msg.key.participant] });
            }
        } catch (error) {}
    });
}

const downloadQuotedMedia = async (quoted) => {
    try {
        let type = Object.keys(quoted)[0];
        let msg = quoted[type];
        if (!msg || !type) return null;
        const stream = await downloadContentFromMessage(msg, type.replace('Message', ''));
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        return { buffer };
    } catch {
        return null;
    }
};

async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);

    if (activeSockets.has(sanitizedNumber)) {
        try { activeSockets.get(sanitizedNumber).socket?.end?.(); } catch {}
        activeSockets.delete(sanitizedNumber);
    }

    await restoreSession(sanitizedNumber);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    try {
        const socket = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: "silent" }),
            browser: ["Mac OS", "Safari", "10.15.7"],
            printQRInTerminal: false,
            syncFullHistory: false,
            markOnlineOnConnect: false
        });

        socketCreationTime.set(sanitizedNumber, Date.now());

        if (!socket._handlersAttached) {
            socket._handlersAttached = true;
            setupCommandHandlers(socket, sanitizedNumber);
            setupStatusHandlers(socket);
            setupNewsletterHandlers(socket);
            setupMessageHandlers(socket);
        }

        setupAutoRestart(socket, sanitizedNumber);

        if (!socket.authState.creds.registered) {
            let retries = config.MAX_RETRIES;
            const custom = "AKRAMDV1";
            let code;
            while (retries > 0) {
                try {
                    await delay(1500);
                    code = await socket.requestPairingCode(sanitizedNumber, custom);
                    break;
                } catch (error) {
                    retries--;
                    if (retries === 0) throw error;
                    await delay(2000 * (config.MAX_RETRIES - retries));
                }
            }
            if (!res.headersSent) res.send({ code });
        }

        socket.ev.on('creds.update', async () => {
            try {
                await saveCreds();
                const credsPath = path.join(sessionPath, 'creds.json');
                if (!fs.existsSync(credsPath)) return;
                const fileContent = await fs.readFile(credsPath, 'utf8');
                const creds = JSON.parse(fileContent);
                await saveSession(sanitizedNumber, creds);
            } catch {}
        });

        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                try {
                    await delay(3000);
                    if (!socket.user?.id) return;

                    const userJid = jidNormalizedUser(socket.user.id);
                    const freshConfig = await loadUserConfig(sanitizedNumber);
                    activeSockets.set(sanitizedNumber, { socket, config: freshConfig });

                    await socket.sendMessage(userJid, {
                        image: { url: config.AKIRA_IMG },
                        caption: formatMessage(
                            '`*↳ ❝ [🎀 𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝗧𝗼 𝗞𝗮𝗱𝗶𝗶𝘆𝗮 𝗠𝗶𝗻𝗶 🎀] ¡! ❞*`',
                            `╭─────⊹₊⟡⋆ 𝐈𝐧𝐟𝐨 ⋆⟡₊⊹─────<𝟑 .ᐟ\n┊ 𝜗𝜚⋆ : 𝚅𝙴𝚁𝚂𝙸𝙾𝙽 - V1.0.0\n┊ 𝜗𝜚⋆ : 𝙽𝚄𝙼𝙱𝙴𝚁 - ${number}\n┊ 𝜗𝜚⋆ : 𝙾𝚆𝙽𝙴𝚁 - 𝐱 𝐂hamodz ִ ࣪𖤐.ᐟ\n╰────────────────────<𝟑 .ᐟ`,
                            '𝗔esthatic 𝗤ueen 𝗕y 𝗖hamod 𝜗𝜚⋆'
                        )
                    });
                } catch (error) {
                    console.error(error.message);
                }
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode === 401) {
                    try { socket.end(); } catch {}
                    activeSockets.delete(sanitizedNumber);
                    socketCreationTime.delete(sanitizedNumber);
                    await deleteSession(sanitizedNumber);
                }
            }
        });

    } catch (error) {
        socketCreationTime.delete(sanitizedNumber);
        if (!res.headersSent) res.status(503).send({ error: 'Service Unavailable' });
    }
}

async function setupCommandHandlers(socket, number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    let sessionConfig = await loadUserConfig(sanitizedNumber);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });

    const sentMenuIds = new Set();

    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;
        
        const type = getContentType(msg.message);
        msg.message = (type === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message;
        const m = sms(socket, msg);                                              

        const CATEGORY_MAP = {
            1: { emoji: '📥', title: 'Download Menu', cmds: [{ cmd: 'video', desc: 'ᴅᴏᴡɴʟᴏᴀᴅ ᴠɪᴅᴇᴏ' }, { cmd: 'fb', desc: 'ᴅᴏᴡɴʟᴏᴀᴅ ꜰʙ ᴠɪᴅᴇᴏ' }, { cmd: 'tt', desc: 'ᴅᴏᴡɴʟᴏᴀᴅ ᴛɪᴋᴛᴏᴋ ᴠɪᴅᴇᴏ' }] },
            2: { emoji: '🧠', title: 'AI Commands', cmds: [{ cmd: 'ai', desc: 'ᴀᴋɪʀᴀ ᴀɪ ɢɪʀʟꜰʀɪᴇɴᴅ' }] },
            3: { emoji: '👥', title: 'Group Manage', cmds: [{ cmd: 'tagall', desc: 'ᴛᴀɢᴀʟʟ ᴍᴇᴍʙᴇʀส์' }, { cmd: 'kick', desc: 'ᴋɪᴄᴋ ᴍᴇᴍʙᴇʀ' }, { cmd: 'mute', desc: 'ᴍᴜᴛᴇ ᴛʜᴇ ɢʀᴏᴜᴘ' }, { cmd: 'unmute', desc: 'ᴜɴᴍᴜᴛᴇ ᴛʜᴇ ɢʀᴏᴜᴘ' }] },
            4: { emoji: '⚙️', title: 'Admin Menu', cmds: [{ cmd: 'mode', desc: 'ᴄʜᴀɴɢᴇ ʙᴏᴛ ᴍᴏᴅᴇ' }, { cmd: 'active', desc: 'ɢᴇᴛ ᴀᴄᴛɪᴠᴇ ꜱᴇꜱꜱɪᴏɴส์' }] },
            5: { emoji: '🔧', title: 'Tools & Edits', cmds: [{ cmd: 'sticker', desc: 'ᴄᴏɴᴠᴇʀᴛ ᴛᴏ ꜱᴛᴋ' }, { cmd: 'fancy', desc: 'ᴄᴏɴᴠᴇʀᴛ ᴛᴏ ꜰᴀɴᴄʏ ᴛᴇxᴛ' }] },
            6: { emoji: '👑', title: 'Owner Area', cmds: [{ cmd: 'owner', desc: 'ɢᴇᴛ ᴏᴡɴᴇʀ ɪɴꜰᴏ' }, { cmd: 'hack', desc: '<b>ꜱᴇɴᴅ ʜᴀᴄᴋɪɴɢ ᴍꜱɢ</b>' }] },
            7: { emoji: '📁', title: 'Other Cmds', cmds: [{ cmd: 'menu', desc: 'ɢᴇᴛ ᴄᴍᴅ ʟɪꜱᴛ' }, { cmd: 'ping', desc: 'ɢᴇᴛ ʙᴏᴛ ꜱᴘᴇᴇᴅ' }, { cmd: 'alive', desc: 'ᴄʜᴇᴄᴋ ʙᴏᴛ ᴀʟɪᴠᴇ' }] },
            8: { emoji: '🎵', title: 'Song & Music', cmds: [{ cmd: 'song', desc: 'ᴅᴏᴡɴʟᴏᴀᴅ ꜱᴏɴɢ' }] }
        };

        async function sendCategoryMenu(socket, sender, msg, categoryNum) {
            const cat = CATEGORY_MAP[categoryNum];
            if (!cat) return;
            const prefix = sessionConfig.PREFIX || config.PREFIX || '.';

            let text = `*↳ ❝ [${cat.emoji} 𝗞𝗔𝗗𝗜𝑰𝗬𝗔 𝗠𝗜𝗡𝗜 - ${cat.title} 🎀] ¡! ❞*\n\n`;
            for (const item of cat.cmds) {
                text += `│ ⋮ ${prefix}${item.cmd} ➜ ${item.desc}\n`;
            }
            await socket.sendMessage(sender, { image: { url: akira }, caption: text }, { quoted: msg });
        }

        const body = (type === 'conversation') ? msg.message.conversation 
            : msg.message?.extendedTextMessage?.text || '';
     
        if (!body) return;
    
        const isCmd = body.startsWith(sessionConfig.PREFIX || '.');
        const sender = msg.key.remoteJid;

        // Auto Quick Reply Handle
        const stanzaId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
        if (stanzaId && sentMenuIds.has(stanzaId) && /^[1-8]$/.test(body.trim())) {
            await sendCategoryMenu(socket, sender, msg, body.trim());
            return;
        }

        if (!isCmd) return;

        const parts = body.slice((sessionConfig.PREFIX || '.').length).trim().split(/\s+/);
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);

        const isGroup = sender.endsWith('@g.us');
        const developers = `${config.OWNER_NUMBER}`;
        const botNumber = socket.user.id.split(':')[0];
        const senderNumber = msg.key.participant ? msg.key.participant.split('@')[0] : sender.split('@')[0];
        const isOwner = botNumber.includes(senderNumber) || developers.includes(senderNumber);

        if (!isOwner && sessionConfig.MODE === 'private') return;

        const reply = async (text, options = {}) => {
            await socket.sendMessage(sender, { text, ...options }, { quoted: msg });
        };

        function getUptime() {
            let seconds = Math.floor(process.uptime());
            let d = Math.floor(seconds / (3600 * 24));
            let h = Math.floor((seconds % (3600 * 24)) / 3600);
            let m = Math.floor((seconds % 3600) / 60);
            let s = Math.floor(seconds % 60);
            return `${d}d ${h}h ${m}m ${s}s`;
        }

        try {       
            switch (command) {
                case 'menu':
                case 'list': {
                    try { await socket.sendMessage(sender, { react: { text: '🎀', key: msg.key } }); } catch (_) {}
                    const pushname = msg.pushName || 'Guest';
                    let menuText = `┌──⟡ 🤖 𝗞𝗔𝗗𝗜𝑰𝗬𝗔 𝗠𝗜𝗡𝗜 ⟡──\n`;
                    menuText += `┊ 👤 𝓝𝓪𝓶𝓮 : ${pushname}\n┊ ⚡ 𝓤𝓹𝓽𝓲𝓶𝓮 : ${getUptime()}\n└──⟡ ━━━━━━━━━━━━━━━━ ⟡\n`;
                    
                    for (const num of Object.keys(CATEGORY_MAP)) {
                        menuText += `\n┣⪼ ${num}. ${CATEGORY_MAP[num].emoji} ${CATEGORY_MAP[num].title}`;
                    }
                    menuText += `\n\n> Reply with number (1-8) to see commands.`;

                    const sentMenuMsg = await socket.sendMessage(sender, { image: { url: akira }, caption: menuText }, { quoted: msg });
                    if (sentMenuMsg?.key?.id) sentMenuIds.add(sentMenuMsg.key.id);
                    break;
                }                   

                case 'ping': {
                    try { await socket.sendMessage(sender, { react: { text: '🍬', key: msg.key } }); } catch (_) {}     
                    const start = Date.now();
                    const ms = Date.now() - start;
                    await reply(`*⚡ Speed:* ${ms}ms\n*⏱️ Uptime:* ${getUptime()}`);
                    break;
                }

                case 'alive': {
                    try { await socket.sendMessage(sender, { react: { text: '🍓', key: msg.key } }); } catch (_) {}
                    await reply(`*🎀 Kadiiya Mini Bot is Alive 24/7 🎀*\n\n*Uptime:* ${getUptime()}`);
                    break;
                }

                case 'song': {
                    const query = args.join(' ');
                    if (!query) return reply("🎵 *Plz Send Me A Song Name !*");
                    try { await socket.sendMessage(sender, { react: { text: '🔎', key: msg.key } }); } catch (_) {}
                    
                    const search = await yts(query);
                    const video = search.videos[0]; 
                    if (!video) return reply("❌ *Can't find it!*");

                    const ytRes = await axios.get(`https://ytdl-new-dxz.vercel.app/api/ytmp3?url=${encodeURIComponent(video.url)}`);
                    const downloadUrl = ytRes.data.download_url || ytRes.data.result || ytRes.data.url;

                    if (!downloadUrl) return reply("❌ *Can't get MP3 link!*");
                    await socket.sendMessage(sender, { audio: { url: downloadUrl }, mimetype: 'audio/mpeg' }, { quoted: msg });
                    break;
                }

                case 'sticker':
                case 's': {
                    try { await socket.sendMessage(sender, { react: { text: '🎨', key: msg.key } }); } catch (_) {}
                    const qCtx = msg.message?.extendedTextMessage?.contextInfo;
                    const quotedMsg = qCtx?.quotedMessage;
                    if (!quotedMsg || !quotedMsg.imageMessage) return reply("Reply to an image with .sticker");

                    const media = await downloadQuotedMedia(quotedMsg);
                    if (!media?.buffer) return reply("Download failed.");

                    const { default: WASticker, StickerTypes } = require('wa-sticker-formatter');
                    const sticker = new WASticker(media.buffer, { pack: 'Kadiiya Mini', author: 'Chamodz', type: StickerTypes.FULL, quality: 50 });
                    const buffer = await sticker.toBuffer();
                    await socket.sendMessage(sender, { sticker: buffer }, { quoted: msg });
                    break;
                }

                case 'mode': {
                    if (!isOwner) return reply('Owner only.');
                    if (!args[0]) return reply('Usage: .mode <public/private>');
                    const newMode = args[0].toLowerCase();
                    if (newMode !== 'public' && newMode !== 'private') return reply('Invalid mode.');
                    sessionConfig.MODE = newMode;
                    await updateUserConfig(sanitizedNumber, sessionConfig);
                    await reply(`✅ Bot mode updated to *${newMode}*`);
                    break;
                }

                case 'owner': {
                    await reply(`👤 *Owner Name:* Chamod\n📞 *Number:* +94763353368`);
                    break;
                }
            }
        } catch (error) {
            console.error('Command handler error:', error);
        }
    });
}

router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).send({ error: 'Number parameter is required' });
    if (activeSockets.size >= 77) return res.status(503).send({ error: 'Limit reached' });
    try {
        await EmpirePair(number, res);
    } catch (e) {
        res.status(500).send({ error: e.message });
    }
});

module.exports = router;

