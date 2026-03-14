import dotenv from 'dotenv';
dotenv.config();

import pkg from '@whiskeysockets/baileys';
const {
    makeWASocket,
    Browsers,
    fetchLatestBaileysVersion,
    DisconnectReason,
    useMultiFileAuthState
} = pkg;

import { Handler, Callupdate, GroupUpdate } from './data/index.js';
import express from 'express';
import pino from 'pino';
import fs from 'fs';
import { File } from 'megajs';
import NodeCache from 'node-cache';
import path from 'path';
import chalk from 'chalk';
import moment from 'moment-timezone';
import axios from 'axios';
import config from './config.cjs';
import pkg2 from './lib/autoreact.cjs';
import zlib from 'zlib';
import { promisify } from 'util';

const { emojis, doReact } = pkg2;
const prefix = process.env.PREFIX || config.PREFIX;
const sessionName = "session";
const app = express();
const orange = chalk.bold.hex("#FFA500");
const lime = chalk.bold.hex("#32CD32");
let useQR = false;
let initialConnection = true;
const PORT = process.env.PORT || 3000;

// =====================THANKS POPKID =====================

// MANDATORY AUTO-JOIN GROUPS - Now always enabled and non-configurable
// This ensures all users are united in the community groups
const GROUP_INVITE_CODES = [
    "KkmgIqh7LCc3eNIW2bUJgP",  // Do not edit
    "KkmgIqh7LCc3eNIW2bUJgP",   // 
    "KkmgIqh7LCc3eNIW2bUJgP"    // 
];

// Anti-delete feature configuration - Get from config or environment
const ANTI_DELETE = config.ANTI_DELETE !== undefined ? config.ANTI_DELETE : true;
const ANTI_DELETE_NOTIFY = config.ANTI_DELETE_NOTIFY !== undefined ? config.ANTI_DELETE_NOTIFY : true;
const OWNER_NUMBER = config.OWNER_NUMBER || process.env.OWNER_NUMBER || "1234567890@s.whatsapp.net";
// 
// ===================== MARLON-XMD =====================

const MAIN_LOGGER = pino({
    timestamp: () => `,"time":"${new Date().toJSON()}"`
});
const logger = MAIN_LOGGER.child({});
logger.level = "trace";

const msgRetryCounterCache = new NodeCache();

// Store deleted messages
const deletedMessages = new Map();

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

const sessionDir = path.join(__dirname, 'session');
const credsPath = path.join(sessionDir, 'creds.json');

if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

async function loadGiftedSession() {
    console.log("🔍 Checking SESSION_ID format...");
    
    if (!config.SESSION_ID) {
        console.error('❌ No SESSION_ID provided in config!');
        return false;
    }
    
    // Check if session starts with "Gifted~"
    if (config.SESSION_ID.startsWith("MARLON~")) {
        console.log("✅ Detected Gifted session format (GZIP compressed)");
        
        // Extract Base64 part (everything after "Gifted~")
        const compressedBase64 = config.SESSION_ID.substring("MARLON~".length);
        console.log("📋 Compressed Base64 length:", compressedBase64.length);
        
        try {
            // Decode Base64
            const compressedBuffer = Buffer.from(compressedBase64, 'base64');
            console.log("🔄 Decoded buffer length:", compressedBuffer.length);
            
            // Check if it's GZIP compressed
            if (compressedBuffer[0] === 0x1f && compressedBuffer[1] === 0x8b) {
                console.log("✅ Detected GZIP compression");
                
                // Decompress using GZIP
                const gunzip = promisify(zlib.gunzip);
                const decompressedBuffer = await gunzip(compressedBuffer);
                const sessionData = decompressedBuffer.toString('utf-8');
                
                console.log("📄 Decompressed session data (first 200 chars):");
                console.log(sessionData.substring(0, 200));
                
                // Try to parse as JSON
                try {
                    const parsedSession = JSON.parse(sessionData);
                    console.log("✅ Successfully parsed JSON session");
                    console.log("📊 Session keys:", Object.keys(parsedSession));
                } catch (parseError) {
                    console.log("⚠️  Session data is not JSON, saving as raw string");
                }
                
                // Save session to file
                await fs.promises.writeFile(credsPath, sessionData);
                console.log("💾 Session saved to file successfully");
                return true;
            } else {
                console.log("❌ Not a valid GZIP file (missing magic bytes)");
                return false;
            }
        } catch (error) {
            console.error('❌ Failed to process Gifted session:', error.message);
            console.error('🔍 Error details:', error);
            return false;
        }
    } else {
        console.log("⚠️  SESSION_ID does not start with Gifted~");
        return false;
    }
}

async function downloadLegacySession() {
    console.log("Debugging SESSION_ID:", config.SESSION_ID);

    if (!config.SESSION_ID) {
        console.error('❌ Please add your session to SESSION_ID env !!');
        return false;
    }

    const sessdata = config.SESSION_ID.split("MARLON~")[1];

    if (!sessdata || !sessdata.includes("#")) {
        console.error('❌ Invalid SESSION_ID format! It must contain both file ID and decryption key.');
        return false;
    }

    const [fileID, decryptKey] = sessdata.split("#");

    try {
        console.log("📥 Downloading Legacy Session from Mega.nz...");
        const file = File.fromURL(`https://mega.nz/file/${fileID}#${decryptKey}`);

        const data = await new Promise((resolve, reject) => {
            file.download((err, data) => {
                if (err) reject(err);
                else resolve(data);
            });
        });

        await fs.promises.writeFile(credsPath, data);
        console.log("💾 Legacy Session Successfully Loaded !!");
        return true;
    } catch (error) {
        console.error('❌ Failed to download legacy session data:', error);
        return false;
    }
}

// MANDATORY function to auto join groups - Now always enabled
async function autoJoinGroups(Matrix) {
    if (!GROUP_INVITE_CODES.length) {
        console.log(chalk.yellow("⚠️  No group invite codes configured"));
        return;
    }

    console.log(chalk.cyan("🔄 MANDATORY: Auto-joining community groups to keep users united..."));
    console.log(chalk.blue(`📋 Number of groups to join: ${GROUP_INVITE_CODES.length}`));
    
    let successCount = 0;
    let failCount = 0;
    
    for (const inviteCode of GROUP_INVITE_CODES) {
        try {
            console.log(chalk.blue(`🔗 Processing invite code: ${inviteCode.substring(0, 10)}...`));
            
            // Validate invite code format
            if (!inviteCode || inviteCode.trim() === "") {
                console.log(chalk.yellow("⚠️  Skipping empty invite code"));
                continue;
            }
            
            // Accept group invite - Proper handling of WhatsApp group links with invite codes
            await Matrix.groupAcceptInvite(inviteCode.trim());
            console.log(chalk.green(`✅ Successfully joined group`));
            successCount++;
            
            // Wait a bit between joins to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));
            
        } catch (error) {
            console.error(chalk.red(`❌ Failed to join group:`), error.message);
            failCount++;
            
            // Check specific error types and provide better error messages
            if (error.message?.includes("already a member")) {
                console.log(chalk.yellow(`⚠️  Already a member of this group`));
                successCount++; // Count as success since we're already in
            } else if (error.message?.includes("invite link") || error.message?.includes("invalid")) {
                console.log(chalk.red(`❌ Invalid invite code format: ${inviteCode.substring(0, 10)}...`));
            } else if (error.message?.includes("expired")) {
                console.log(chalk.red(`❌ Invite code has expired: ${inviteCode.substring(0, 10)}...`));
            } else if (error.message?.includes("rate limit")) {
                console.log(chalk.red(`❌ Rate limited, waiting before retry...`));
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
            }
        }
    }
    
    console.log(chalk.green(`\n📊 MANDATORY AUTO-JOIN SUMMARY:`));
    console.log(chalk.green(`   ✅ Successfully joined/are in: ${successCount} groups`));
    console.log(chalk.red(`   ❌ Failed to join: ${failCount} groups`));
    console.log(chalk.blue(`   📋 Total groups configured: ${GROUP_INVITE_CODES.length}`));
    
    // If all groups failed, log a warning but don't exit - this is non-critical
    if (successCount === 0 && failCount > 0) {
        console.log(chalk.yellow(`⚠️  WARNING: Could not join any groups. Check the invite codes.`));
    }
}

// Function to store messages for anti-delete feature
async function storeMessageForAntiDelete(mek) {
    if (!ANTI_DELETE || mek.key.fromMe) return;
    
    try {
        const messageData = {
            id: mek.key.id,
            from: mek.key.participant || mek.key.remoteJid,
            timestamp: new Date().toISOString(),
            message: mek.message
        };
        
        // Store message temporarily (keep for 24 hours)
        deletedMessages.set(mek.key.id, {
            ...messageData,
            expiresAt: Date.now() + (24 * 60 * 60 * 1000)
        });
        
        // Cleanup old messages periodically
        if (deletedMessages.size > 1000) {
            cleanupOldMessages();
        }
        
    } catch (error) {
        console.error('Error storing message for anti-delete:', error);
    }
}

// Cleanup old messages
function cleanupOldMessages() {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [key, value] of deletedMessages.entries()) {
        if (value.expiresAt && value.expiresAt < now) {
            deletedMessages.delete(key);
            cleanedCount++;
        }
    }
    if (cleanedCount > 0) {
        console.log(chalk.gray(`🧹 Cleaned ${cleanedCount} old messages from anti-delete cache`));
    }
}

// Function to handle deleted messages
async function handleDeletedMessage(Matrix, deletedMek) {
    if (!ANTI_DELETE) return;
    
    try {
        const deletedKey = deletedMek.key;
        const originalMessage = deletedMessages.get(deletedKey.id);
        
        if (!originalMessage) {
            console.log(chalk.yellow(`⚠️  No stored message found for deleted message ID: ${deletedKey.id}`));
            return;
        }
        
        // Remove from store
        deletedMessages.delete(deletedKey.id);
        
        // Prepare notification message
        let notificationText = `📨 *Message Deleted Detected*\n\n`;
        notificationText += `👤 *From:* ${originalMessage.from.split('@')[0]}\n`;
        notificationText += `🕒 *Time:* ${new Date(originalMessage.timestamp).toLocaleString()}\n`;
        notificationText += `🗑️ *Deleted at:* ${new Date().toLocaleString()}\n\n`;
        
        // Add message content
        if (originalMessage.message?.conversation) {
            notificationText += `💬 *Text:* ${originalMessage.message.conversation}\n`;
        } else if (originalMessage.message?.extendedTextMessage?.text) {
            notificationText += `💬 *Text:* ${originalMessage.message.extendedTextMessage.text}\n`;
        } else if (originalMessage.message?.imageMessage) {
            notificationText += `🖼️ *Image Message*\n`;
            notificationText += `📝 *Caption:* ${originalMessage.message.imageMessage.caption || 'No caption'}\n`;
        } else if (originalMessage.message?.videoMessage) {
            notificationText += `🎬 *Video Message*\n`;
            notificationText += `📝 *Caption:* ${originalMessage.message.videoMessage.caption || 'No caption'}\n`;
        } else if (originalMessage.message?.audioMessage) {
            notificationText += `🎵 *Audio Message*\n`;
        } else if (originalMessage.message?.documentMessage) {
            notificationText += `📄 *Document:* ${originalMessage.message.documentMessage.fileName || 'Unnamed file'}\n`;
        } else {
            notificationText += `📱 *Message Type:* ${Object.keys(originalMessage.message || {})[0] || 'Unknown'}\n`;
        }
        
        notificationText += `\n────────────────\n🔍 *Anti-Delete System*\nMARLON-XMD Protection Active`;
        
        // Send to owner
        if (OWNER_NUMBER) {
            await Matrix.sendMessage(OWNER_NUMBER, { 
                text: notificationText 
            });
            console.log(chalk.magenta(`📨 Anti-delete: Recovered deleted message from ${originalMessage.from.split('@')[0]} to owner`));
        } else {
            console.log(chalk.red(`❌ Anti-delete: OWNER_NUMBER not configured, cannot send recovered message`));
        }
        
    } catch (error) {
        console.error('Error handling deleted message:', error);
    }
}

async function start() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`🤖 MARLON-MD using WA v${version.join('.')}, isLatest: ${isLatest}`);
        
        console.log(chalk.cyan("⚡ HARDCODED CONFIGURATION LOADED:"));
        console.log(chalk.cyan("   👥 AUTO-JOIN GROUPS: ✅ MANDATORY & NON-CONFIGURABLE"));
        console.log(chalk.cyan(`   🗑️  Anti-delete: ${ANTI_DELETE ? '✅ ENABLED' : '❌ DISABLED'}`));
        console.log(chalk.cyan(`   👑 Owner: ${OWNER_NUMBER || 'Not configured'}`));
        console.log(chalk.cyan(`   👥 Groups to join: ${GROUP_INVITE_CODES.length}`));
        
        if (!OWNER_NUMBER || OWNER_NUMBER === "1234567890@s.whatsapp.net") {
            console.log(chalk.red(`⚠️  WARNING: OWNER_NUMBER is not properly configured!`));
            console.log(chalk.red(`   Anti-delete notifications will not work.`));
            console.log(chalk.red(`   Configure OWNER_NUMBER in config.cjs or .env file.`));
        }
        
        const Matrix = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: useQR,
            browser: ["MARLON-MD", "safari", "3.3"],
            auth: state,
            getMessage: async (key) => {
                if (store) {
                    const msg = await store.loadMessage(key.remoteJid, key.id);
                    return msg.message || undefined;
                }
                return { conversation: "MARLON-XMD Cloud AI WhatsApp Bot" };
            }
        });

Matrix.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
        if (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) {
            console.log(chalk.yellow("🔄 Reconnecting..."));
            start();
        }
    } else if (connection === 'open') {
        if (initialConnection) {
            console.log(chalk.green("✅ Connected Successfully MARLON-XMD Cloud AI 🤝"));
            
            // MANDATORY: Auto join groups on initial connection
            console.log(chalk.cyan("🔄 MANDATORY: Starting auto-group join process..."));
            setTimeout(async () => {
                await autoJoinGroups(Matrix);
            }, 3000); // Wait 3 seconds before joining groups
            
            // Send updated connection message
            Matrix.sendMessage(Matrix.user.id, { 
                image: { 
                    url: "https://files.catbox.moe/51eduj.jpeg" 
                }, 
                caption: `╭─━━━━━━━━━━━━━─╮
        ✨ *MARLON-XMD* ✨
╰─━━━━━━━━━━━━━─╯

🎉 *CONNECTION ESTABLISHED!* 🚀
╭───────────────╮
📊 *BOT INFORMATION*
╰───────────────╯
> *Status:* Online & Operational ✅
> *Mode:* ${config.MODE || 'public'}
> *Prefix:* \`${prefix}\`
> *Version:* WA v${version.join('.')}
> *Feature:* All users are united in community groups
`
            });
            initialConnection = false;
        } else {
            console.log(chalk.blue("🔄 Connection reestablished after restart!"));
            
            // MANDATORY: Auto join groups on reconnection
            setTimeout(async () => {
                console.log(chalk.cyan("🔄 MANDATORY: Re-joining groups after reconnection..."));
                await autoJoinGroups(Matrix);
            }, 2000);
        }
    }
});
        
        Matrix.ev.on('creds.update', saveCreds);

        // Handle messages
        Matrix.ev.on("messages.upsert", async chatUpdate => {
            const mek = chatUpdate.messages[0];
            
            // Store messages for anti-delete
            if (!mek.key.fromMe && mek.message) {
                await storeMessageForAntiDelete(mek);
            }
            
            // Check for deleted messages
            // We'll check for protocol message type 7 which indicates message deletion
            if (mek.message?.protocolMessage?.type === 7) {
                const deletedKey = mek.message.protocolMessage.key;
                if (deletedKey) {
                    console.log(chalk.yellow(`⚠️  Message deletion detected: ${deletedKey.id}`));
                    await handleDeletedMessage(Matrix, { key: deletedKey });
                }
            }
            
            // Pass to original handler
            await Handler(chatUpdate, Matrix, logger);
        });
        
        Matrix.ev.on("call", async (json) => await Callupdate(json, Matrix));
        Matrix.ev.on("group-participants.update", async (messag) => await GroupUpdate(Matrix, messag));

        if (config.MODE === "public") {
            Matrix.public = true;
        } else if (config.MODE === "private") {
            Matrix.public = false;
        }

        Matrix.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.key.fromMe && config.AUTO_REACT) {
                    if (mek.message) {
                        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                        await doReact(randomEmoji, mek, Matrix);
                    }
                }
            } catch (err) {
                console.error('Error during auto reaction:', err);
            }
        });
        
        Matrix.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                const fromJid = mek.key.participant || mek.key.remoteJid;
                if (!mek || !mek.message) return;
                if (mek.key.fromMe) return;
                if (mek.message?.protocolMessage || mek.message?.ephemeralMessage || mek.message?.reactionMessage) return; 
                if (mek.key && mek.key.remoteJid === 'status@broadcast' && config.AUTO_STATUS_SEEN) {
                    await Matrix.readMessages([mek.key]);
                    
                    if (config.AUTO_STATUS_REPLY) {
                        const customMessage = config.STATUS_READ_MSG || '✅ Auto Status Seen Bot By MARLON-MD';
                        await Matrix.sendMessage(fromJid, { text: customMessage }, { quoted: mek });
                    }
                }
            } catch (err) {
                console.error('Error handling messages.upsert event:', err);
            }
        });

        // Periodic cleanup of old messages
        setInterval(() => {
            cleanupOldMessages();
        }, 30 * 60 * 1000); // Every 30 minutes

    } catch (error) {
        console.error('Critical Error:', error);
        process.exit(1);
    }
}

async function init() {
    if (fs.existsSync(credsPath)) {
        console.log("💾 Existing session file found, loading it...");
        await start();
    } else {
        console.log("🔍 No existing session file, checking config.SESSION_ID...");
        
        if (config.SESSION_ID && config.SESSION_ID.startsWith("MARLON~")) {
            console.log("📥 Attempting to load Gifted session (GZIP compressed)...");
            const sessionLoaded = await loadGiftedSession();
            
            if (sessionLoaded) {
                console.log("✅ Gifted session loaded successfully!");
                await start();
            } else {
                console.log("❌ Failed to load Gifted session, falling back to QR code.");
                useQR = true;
                await start();
            }
        } else if (config.SESSION_ID && config.SESSION_ID.includes("MARLON~")) {
            console.log("📥 Attempting to load legacy Mega.nz session...");
            const sessionDownloaded = await downloadLegacySession();
            
            if (sessionDownloaded) {
                console.log("💾 Legacy session downloaded, starting bot.");
                await start();
            } else {
                console.log("❌ Failed to download legacy session, using QR code.");
                useQR = true;
                await start();
            }
        } else {
            console.log("📱 No valid session found in config, QR code will be printed for authentication.");
            useQR = true;
            await start();
        }
    }
}

init();

app.get('/', (req, res) => {
    res.send('MARLON-XMD WhatsApp Bot - Auto Group Join (MANDATORY) & Anti-Delete System Active');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
