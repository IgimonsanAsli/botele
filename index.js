require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const TikTokDownloader = require('./handlers/tiktokdownloader');
const InstagramHandler = require('./handlers/instagram');
const HitamkanHandler = require('./handlers/hitamkan');
const ReminiHandler = require('./handlers/remini');
const YtMp3Handler = require('./handlers/ytmp3');
const YtMp4Handler = require('./handlers/ytmp4');
const YtShortsHandler = require('./handlers/ytshorts');
const RateLimiter = require('./utils/ratelimiter');

// Konfigurasi dari environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const FERDEV_API_KEY = process.env.FERDEV_API_KEY;
const UPLOADER_URL = process.env.UPLOADER_URL;

if (!BOT_TOKEN || !FERDEV_API_KEY) {
  console.error('Error: BOT_TOKEN dan FERDEV_API_KEY harus diisi di file .env');
  process.exit(1);
}

// Inisialisasi bot dan handlers
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const tiktokDownloader = new TikTokDownloader(bot);
const instagramHandler = new InstagramHandler(bot, FERDEV_API_KEY);
const hitamkanHandler = new HitamkanHandler(bot, FERDEV_API_KEY, UPLOADER_URL);
const reminiHandler = new ReminiHandler(bot, FERDEV_API_KEY, UPLOADER_URL);
const ytMp3Handler = new YtMp3Handler(bot, FERDEV_API_KEY);
const ytMp4Handler = new YtMp4Handler(bot, FERDEV_API_KEY);
const ytShortsHandler = new YtShortsHandler(bot, FERDEV_API_KEY);

// Inisialisasi Rate Limiter
const rateLimiter = new RateLimiter({
  maxRequests: 5,        // Maksimal 5 request
  timeWindow: 2 * 60 * 1000,    // dalam 2 menit
  blockDuration: 5 * 60 * 1000  // Block selama 5 menit
});

console.log('✅ Rate limiter initialized: 5 requests per 2 minutes');

// Register semua handlers
tiktokDownloader.register();
instagramHandler.register();
hitamkanHandler.register();
reminiHandler.register();
ytMp3Handler.register();
ytMp4Handler.register();
ytShortsHandler.register();

console.log('Bot Telegram berhasil dijalankan!');

// ============================================
// RATE LIMITER MIDDLEWARE
// ============================================

/**
 * Cek rate limit untuk user
 * @param {number} userId - User ID dari Telegram
 * @param {number} chatId - Chat ID untuk mengirim pesan error
 * @returns {boolean} true jika allowed, false jika blocked
 */
async function checkRateLimit(userId, chatId) {
  const result = rateLimiter.checkLimit(userId);
  
  if (!result.allowed) {
    await bot.sendMessage(chatId, result.message, { parse_mode: 'Markdown' });
    return false;
  }
  
  return true;
}

// ============================================
// TEMPORARY STORAGE UNTUK YOUTUBE URLs
// ============================================
const youtubeUrlStorage = new Map(); // Format: messageId -> url
const youtubeShortsStorage = new Map(); // Format: messageId -> url

// Pesan help menu
const helpMessage = `
🤖 *Selamat datang di Bot Downloader!*

📱 *Fitur yang tersedia:*

🎵 *TikTok Downloader*
• /tiktok <link> - Download video/carousel TikTok
• /t <link> - Shortcut untuk TikTok
• Kirim link TikTok langsung (otomatis terdeteksi)

📸 *Instagram Downloader*
• /ig <link> - Download video/foto/carousel Instagram
• Kirim link Instagram langsung (otomatis terdeteksi)

🎧 *YouTube MP3 Downloader*
• /ytmp3 <link> - Download audio dari YouTube
• Format: MP3 berkualitas tinggi

🎬 *YouTube MP4 Downloader*
• /ytmp4 <link> - Download video dari YouTube
• Format: MP4 berkualitas tinggi

📹 *YouTube Shorts Downloader*
• /ytshort <link> - Download YouTube Shorts
• Kirim link Shorts langsung (otomatis terdeteksi)

⚫ *Image to Black & White*
• /hitamkan - Kirim gambar untuk dihitamkan
• Reply gambar dengan /hitamkan

✨ *Image Enhancer (Remini)*
• /remini - Tingkatkan kualitas gambar
• Reply gambar dengan /remini

💡 *Contoh penggunaan:*
\`/tiktok https://vt.tiktok.com/xxxxx\`
\`/t https://www.tiktok.com/@user/video/xxxxx\`
\`/ig https://www.instagram.com/p/xxxxx\`
\`/ytmp3 https://youtu.be/xxxxx\`
\`/ytmp4 https://youtu.be/xxxxx\`
\`/ytshort https://youtube.com/shorts/xxxxx\`
\`/hitamkan\` (lalu kirim gambar)
\`/remini\` (lalu kirim gambar)

📥 *Auto Download:*
Kirim link langsung tanpa command!
• TikTok: https://vt.tiktok.com/xxxxx
• Instagram: https://www.instagram.com/p/xxxxx
• YouTube: https://youtu.be/xxxxx (pilih format MP3/MP4)
• YouTube Shorts: https://youtube.com/shorts/xxxxx

⚡ *Rate Limit:* 5 request per 2 menit untuk mencegah spam

_Bot by igimonsan mendukung video, foto, carousel, dan slideshow!_
`;

// ============================================
// REGEX PATTERNS UNTUK DETECT LINKS
// ============================================
const TIKTOK_REGEX = /(?:https?:\/\/)?(?:www\.|vm\.|vt\.)?tiktok\.com\/(?:@[\w.-]+\/video\/|t\/|v\/)?[\w.-]+/gi;
const INSTAGRAM_REGEX = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|tv)\/[\w-]+\/?/gi;
const YOUTUBE_SHORTS_REGEX = /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/shorts\/[\w-]+(?:\?[^\s]*)?/gi;
const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)[\w-]+(?:\?[^\s]*)?/gi;

// ============================================
// DIRECT LINK HANDLER
// ============================================
bot.on('text', async (msg) => {
  // Skip jika pesan adalah command
  if (msg.text.startsWith('/')) {
    return;
  }

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  // Cek apakah ada link TikTok
  const tiktokMatches = text.match(TIKTOK_REGEX);
  if (tiktokMatches && tiktokMatches.length > 0) {
    // Cek rate limit
    if (!(await checkRateLimit(userId, chatId))) {
      return;
    }

    for (const url of tiktokMatches) {
      console.log(`🎵 Auto-detected TikTok link: ${url}`);
      await tiktokDownloader.processTikTok(chatId, url.trim());
      
      // Delay jika ada multiple links
      if (tiktokMatches.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    return; // Stop processing setelah handle TikTok
  }

  // Cek apakah ada link Instagram
  const instagramMatches = text.match(INSTAGRAM_REGEX);
  if (instagramMatches && instagramMatches.length > 0) {
    // Cek rate limit
    if (!(await checkRateLimit(userId, chatId))) {
      return;
    }

    for (const url of instagramMatches) {
      console.log(`📸 Auto-detected Instagram link: ${url}`);
      
      // Buat match object untuk compatibility dengan handleCommand
      const match = [null, url.trim()];
      await instagramHandler.handleCommand(msg, match);
      
      // Delay jika ada multiple links
      if (instagramMatches.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    return; // Stop processing setelah handle Instagram
  }

  // Cek apakah ada link YouTube Shorts (harus dicek SEBELUM YouTube biasa)
  const youtubeShortsMatches = text.match(YOUTUBE_SHORTS_REGEX);
  if (youtubeShortsMatches && youtubeShortsMatches.length > 0) {
    // Cek rate limit
    if (!(await checkRateLimit(userId, chatId))) {
      return;
    }

    for (const url of youtubeShortsMatches) {
      const cleanUrl = url.trim();
      console.log(`📹 Auto-detected YouTube Shorts link: ${cleanUrl}`);
      
      // Kirim pesan dengan button download
      const sentMessage = await bot.sendMessage(
        chatId,
        `📹 *Link YouTube Shorts terdeteksi!*\n\nKlik tombol di bawah untuk mendownload:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📥 Download Video', callback_data: 'ytshort:temp' }
              ]
            ]
          }
        }
      );
      
      // Simpan URL dengan message ID sebagai key
      youtubeShortsStorage.set(sentMessage.message_id, cleanUrl);
      
      // Auto-cleanup setelah 5 menit
      setTimeout(() => {
        youtubeShortsStorage.delete(sentMessage.message_id);
      }, 5 * 60 * 1000);
      
      // Delay jika ada multiple links
      if (youtubeShortsMatches.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    return; // Stop processing setelah handle YouTube Shorts
  }

  // Cek apakah ada link YouTube (biasa)
  const youtubeMatches = text.match(YOUTUBE_REGEX);
  if (youtubeMatches && youtubeMatches.length > 0) {
    // Cek rate limit
    if (!(await checkRateLimit(userId, chatId))) {
      return;
    }

    for (const url of youtubeMatches) {
      const cleanUrl = url.trim();
      console.log(`🎬 Auto-detected YouTube link: ${cleanUrl}`);
      
      // Kirim pesan dengan pilihan format
      const sentMessage = await bot.sendMessage(
        chatId,
        `🎬 *Link YouTube terdeteksi!*\n\nPilih format yang ingin didownload:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🎧 MP3 (Audio)', callback_data: 'ytmp3:temp' },
                { text: '🎬 MP4 (Video)', callback_data: 'ytmp4:temp' }
              ]
            ]
          }
        }
      );
      
      // Simpan URL dengan message ID sebagai key
      youtubeUrlStorage.set(sentMessage.message_id, cleanUrl);
      
      // Auto-cleanup setelah 5 menit
      setTimeout(() => {
        youtubeUrlStorage.delete(sentMessage.message_id);
      }, 5 * 60 * 1000);
      
      // Delay jika ada multiple links
      if (youtubeMatches.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    return; // Stop processing setelah handle YouTube
  }
});

// ============================================
// CALLBACK QUERY HANDLER (untuk button YouTube)
// ============================================
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const messageId = query.message.message_id;
  const data = query.data;

  // Answer callback query untuk menghilangkan loading
  await bot.answerCallbackQuery(query.id);

  // Handle YouTube Shorts
  if (data.startsWith('ytshort:')) {
    // Cek rate limit
    if (!(await checkRateLimit(userId, chatId))) {
      // Delete the selection message jika rate limited
      await bot.deleteMessage(chatId, messageId).catch(() => {});
      return;
    }

    const url = youtubeShortsStorage.get(messageId);
    
    if (!url) {
      await bot.editMessageText(
        '❌ *Link sudah expired!*\n\nSilakan kirim link YouTube Shorts lagi.',
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown'
        }
      );
      return;
    }

    console.log(`📹 User requested download for Shorts: ${url}`);
    
    // Edit message untuk remove buttons
    await bot.editMessageText(
      '📹 *Memproses YouTube Shorts...*\n\nSilakan tunggu sebentar...',
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      }
    );
    
    // Process YouTube Shorts
    await ytShortsHandler.processYtShorts(chatId, url);
    
    // Delete the selection message
    await bot.deleteMessage(chatId, messageId);
    
    // Cleanup storage
    youtubeShortsStorage.delete(messageId);
    return;
  }

  // Handle YouTube MP3/MP4
  const url = youtubeUrlStorage.get(messageId);
  
  if (!url) {
    await bot.editMessageText(
      '❌ *Link sudah expired!*\n\nSilakan kirim link YouTube lagi.',
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      }
    );
    return;
  }

  // Parse callback data
  if (data.startsWith('ytmp3:')) {
    // Cek rate limit
    if (!(await checkRateLimit(userId, chatId))) {
      // Delete the selection message jika rate limited
      await bot.deleteMessage(chatId, messageId).catch(() => {});
      return;
    }

    console.log(`🎧 User selected MP3 for: ${url}`);
    
    // Edit message untuk remove buttons
    await bot.editMessageText(
      '🎧 *Memproses MP3...*\n\nSilakan tunggu sebentar...',
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      }
    );
    
    // Process MP3
    await ytMp3Handler.processYtMp3(chatId, url);
    
    // Delete the selection message
    await bot.deleteMessage(chatId, messageId);
    
    // Cleanup storage
    youtubeUrlStorage.delete(messageId);
    
  } else if (data.startsWith('ytmp4:')) {
    // Cek rate limit
    if (!(await checkRateLimit(userId, chatId))) {
      // Delete the selection message jika rate limited
      await bot.deleteMessage(chatId, messageId).catch(() => {});
      return;
    }

    console.log(`🎬 User selected MP4 for: ${url}`);
    
    // Edit message untuk remove buttons
    await bot.editMessageText(
      '🎬 *Memproses MP4...*\n\nSilakan tunggu sebentar...',
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      }
    );
    
    // Process MP4
    await ytMp4Handler.processYtMp4(chatId, url);
    
    // Delete the selection message
    await bot.deleteMessage(chatId, messageId);
    
    // Cleanup storage
    youtubeUrlStorage.delete(messageId);
  }
});

// ============================================
// GLOBAL IMAGE HANDLER
// ============================================

// Handler untuk menerima gambar (koordinasi antar handler)
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const caption = msg.caption || '';

  // Cek apakah sedang menunggu untuk /hitamkan
  if (hitamkanHandler.isWaitingForImage(chatId) && !caption.includes('/hitamkan') && !caption.includes('/remini')) {
    // Cek rate limit
    if (!(await checkRateLimit(userId, chatId))) {
      hitamkanHandler.clearWaitingStatus(chatId);
      return;
    }

    hitamkanHandler.clearWaitingStatus(chatId);
    await hitamkanHandler.processHitamkan(chatId, msg);
    return;
  }

  // Cek apakah sedang menunggu untuk /remini
  if (reminiHandler.isWaitingForImage(chatId) && !caption.includes('/remini') && !caption.includes('/hitamkan')) {
    // Cek rate limit
    if (!(await checkRateLimit(userId, chatId))) {
      reminiHandler.clearWaitingStatus(chatId);
      return;
    }

    reminiHandler.clearWaitingStatus(chatId);
    await reminiHandler.processRemini(chatId, msg);
    return;
  }
});

// ============================================
// BASIC COMMANDS
// ============================================

// Command /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// Command /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// Command /stats (untuk melihat statistik rate limit - opsional, bisa untuk admin)
bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  const userStats = rateLimiter.getUserStats(userId);
  const globalStats = rateLimiter.getGlobalStats();
  
  const statsMessage = `
📊 *Statistik Rate Limiter*

👤 *Statistik Kamu:*
• Request: ${userStats.requestCount}/${rateLimiter.maxRequests}
• Sisa: ${userStats.remainingRequests} request
• Status: ${userStats.isBlocked ? '🚫 Blocked' : '✅ Active'}

🌐 *Statistik Global:*
• Total Users: ${globalStats.totalUsers}
• Active Users: ${globalStats.activeUsers}
• Blocked Users: ${globalStats.blockedUsers}

⚙️ *Konfigurasi:*
• Max Requests: ${rateLimiter.maxRequests}
• Time Window: ${rateLimiter.timeWindow / 60000} menit
• Block Duration: ${rateLimiter.blockDuration / 60000} menit
  `;
  
  await bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
});

// Handler untuk command yang tidak dikenali
bot.on('message', (msg) => {
  const text = msg.text;
  
  if (text && text.startsWith('/')) {
    // Daftar command yang valid
    const validCommands = /^\/(start|help|tiktok|t|ig|ytmp3|ytmp4|ytshort|hitamkan|remini|stats)\b/;
    
    if (!text.match(validCommands)) {
      bot.sendMessage(msg.chat.id, '❌ Command tidak dikenali. Ketik /start atau /help untuk melihat menu bantuan.');
    }
  }
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping bot...');
  bot.stopPolling();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Stopping bot...');
  bot.stopPolling();
  process.exit(0);
});