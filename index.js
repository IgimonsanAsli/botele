require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const TikTokDownloader = require('./handlers/tiktokdownloader');
const InstagramHandler = require('./handlers/instagram');
const HitamkanHandler = require('./handlers/hitamkan');
const ReminiHandler = require('./handlers/remini');
const YtMp3Handler = require('./handlers/ytmp3');
const YtMp4Handler = require('./handlers/ytmp4');

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

// Register semua handlers
tiktokDownloader.register();
instagramHandler.register();
hitamkanHandler.register();
reminiHandler.register();
ytMp3Handler.register();
ytMp4Handler.register();

console.log('Bot Telegram berhasil dijalankan!');

// ============================================
// TEMPORARY STORAGE UNTUK YOUTUBE URLs
// ============================================
const youtubeUrlStorage = new Map(); // Format: messageId -> url

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
\`/hitamkan\` (lalu kirim gambar)
\`/remini\` (lalu kirim gambar)

📥 *Auto Download:*
Kirim link langsung tanpa command!
• TikTok: https://vt.tiktok.com/xxxxx
• Instagram: https://www.instagram.com/p/xxxxx
• YouTube: https://youtu.be/xxxxx (pilih format MP3/MP4)

_Bot by igimonsan mendukung video, foto, carousel, dan slideshow!_
`;

// ============================================
// REGEX PATTERNS UNTUK DETECT LINKS
// ============================================
const TIKTOK_REGEX = /(?:https?:\/\/)?(?:www\.|vm\.|vt\.)?tiktok\.com\/(?:@[\w.-]+\/video\/|t\/|v\/)?[\w.-]+/gi;
const INSTAGRAM_REGEX = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|tv)\/[\w-]+\/?/gi;
const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/)|youtu\.be\/)[\w-]+(?:\?[^\s]*)?/gi;

// ============================================
// DIRECT LINK HANDLER
// ============================================
bot.on('text', async (msg) => {
  // Skip jika pesan adalah command
  if (msg.text.startsWith('/')) {
    return;
  }

  const chatId = msg.chat.id;
  const text = msg.text;

  // Cek apakah ada link TikTok
  const tiktokMatches = text.match(TIKTOK_REGEX);
  if (tiktokMatches && tiktokMatches.length > 0) {
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

  // Cek apakah ada link YouTube
  const youtubeMatches = text.match(YOUTUBE_REGEX);
  if (youtubeMatches && youtubeMatches.length > 0) {
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
  const messageId = query.message.message_id;
  const data = query.data;

  // Answer callback query untuk menghilangkan loading
  await bot.answerCallbackQuery(query.id);

  // Ambil URL dari storage
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
  const caption = msg.caption || '';

  // Cek apakah sedang menunggu untuk /hitamkan
  if (hitamkanHandler.isWaitingForImage(chatId) && !caption.includes('/hitamkan') && !caption.includes('/remini')) {
    hitamkanHandler.clearWaitingStatus(chatId);
    await hitamkanHandler.processHitamkan(chatId, msg);
    return;
  }

  // Cek apakah sedang menunggu untuk /remini
  if (reminiHandler.isWaitingForImage(chatId) && !caption.includes('/remini') && !caption.includes('/hitamkan')) {
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

// Handler untuk command yang tidak dikenali
bot.on('message', (msg) => {
  const text = msg.text;
  
  if (text && text.startsWith('/')) {
    // Daftar command yang valid
    const validCommands = /^\/(start|help|tiktok|t|ig|ytmp3|ytmp4|hitamkan|remini)\b/;
    
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