require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const TikTokDownloader = require('./handlers/tiktokdownloader');
const InstagramHandler = require('./handlers/instagram');
const HitamkanHandler = require('./handlers/hitamkan');
const ReminiHandler = require('./handlers/remini');

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
const tiktokDownloader = new TikTokDownloader();
const instagramHandler = new InstagramHandler(bot, FERDEV_API_KEY);
const hitamkanHandler = new HitamkanHandler(bot, FERDEV_API_KEY, UPLOADER_URL);
const reminiHandler = new ReminiHandler(bot, FERDEV_API_KEY, UPLOADER_URL);

// Register handlers
instagramHandler.register();
hitamkanHandler.register();
reminiHandler.register();

console.log('Bot Telegram berhasil dijalankan!');

// Pesan help menu
const helpMessage = `
🤖 *Selamat datang di Bot Downloader!*

📱 *Fitur yang tersedia:*

🎵 *TikTok Downloader*
• /tiktok <url> - Download video/carousel TikTok
• /t <url> - Shortcut untuk TikTok

📸 *Instagram Downloader*
• /ig <url> - Download video/foto/carousel Instagram

⚫ *Image to Black & White*
• /hitamkan - Kirim gambar untuk dihitamkan
• Reply gambar dengan /hitamkan
• Kirim gambar dengan caption /hitamkan

✨ *Image Enhancer (Remini)*
• /remini - Tingkatkan kualitas gambar
• Reply gambar dengan /remini
• Kirim gambar dengan caption /remini

💡 *Contoh penggunaan:*
\`/tiktok https://vt.tiktok.com/xxxxx\`
\`/t https://www.tiktok.com/@user/video/xxxxx\`
\`/ig https://www.instagram.com/p/xxxxx\`
\`/hitamkan\` (lalu kirim gambar)
\`/remini\` (lalu kirim gambar)

_Bot ini mendukung video, foto, carousel, dan slideshow!_
`;

// ============================================
// HELPER FUNCTIONS
// ============================================

// Helper function untuk format stats
function formatStats(stats) {
  if (!stats) return '';
  
  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  return `👁️ ${formatNumber(stats.views)} • ❤️ ${formatNumber(stats.likes)} • 💬 ${formatNumber(stats.comments)} • 🔄 ${formatNumber(stats.shares)}`;
}

// ============================================
// TIKTOK HANDLER
// ============================================

// Command /tiktok atau /t
bot.onText(/\/(tiktok|t)\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const url = match[2].trim();

  if (!url) {
    bot.sendMessage(chatId, '❌ Mohon masukkan URL TikTok!\n\nContoh:\n/tiktok https://vt.tiktok.com/xxxxx\n/t https://www.tiktok.com/@user/video/xxxxx\n/t https://vm.tiktok.com/xxxxx');
    return;
  }

  // Validasi apakah URL mengandung domain TikTok
  if (!url.match(/tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com/i)) {
    bot.sendMessage(chatId, '❌ URL tidak valid! Pastikan ini adalah link TikTok yang benar.');
    return;
  }

  const processingMsg = await bot.sendMessage(chatId, '⏳ Sedang memproses konten TikTok...');

  try {
    // Gunakan class TikTokDownloader untuk mendapatkan info konten
    const contentInfo = await tiktokDownloader.downloadContent(url);

    if (!contentInfo.success) {
      bot.editMessageText(`❌ ${contentInfo.error || 'Gagal mengunduh konten TikTok'}\n\nPastikan:\n• Link masih aktif\n• Video tidak di-private\n• Format URL benar`, {
        chat_id: chatId,
        message_id: processingMsg.message_id
      });
      return;
    }

    // Hapus pesan processing
    await bot.deleteMessage(chatId, processingMsg.message_id);

    // Handle berdasarkan tipe konten
    if (contentInfo.type === 'carousel') {
      // CAROUSEL/SLIDESHOW - Kirim semua gambar
      await bot.sendMessage(chatId, `🖼️ *TikTok Carousel*\n\n👤 Author: ${contentInfo.author.nickname} (@${contentInfo.author.username})\n📝 ${contentInfo.title}\n🎵 Music: ${contentInfo.music.title} - ${contentInfo.music.author}\n\n📊 ${formatStats(contentInfo.stats)}\n\n⬇️ Mengunduh ${contentInfo.images.length} gambar...`, {
        parse_mode: 'Markdown'
      });

      // Kirim semua gambar satu per satu
      for (let i = 0; i < contentInfo.images.length; i++) {
        const image = contentInfo.images[i];
        
        try {
          await bot.sendPhoto(chatId, image.url, {
            caption: `🖼️ Gambar ${i + 1}/${contentInfo.images.length}`
          });

          // Delay untuk menghindari rate limit
          if (i < contentInfo.images.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          console.error(`Error sending image ${i + 1}:`, error.message);
        }
      }

      // Kirim musik jika tersedia
      if (contentInfo.music && contentInfo.music.url) {
        try {
          await bot.sendMessage(chatId, '🎵 Sedang mengunduh musik...');
          await bot.sendAudio(chatId, contentInfo.music.url, {
            title: contentInfo.music.title,
            performer: contentInfo.music.author,
            caption: `🎵 ${contentInfo.music.title} - ${contentInfo.music.author}`
          });
        } catch (error) {
          console.error('Error sending music:', error.message);
          await bot.sendMessage(chatId, '⚠️ Musik tidak dapat diunduh');
        }
      }

      console.log('✅ TikTok carousel sent successfully');

    } else {
      // VIDEO - Kirim video
      const videoUrl = contentInfo.video.noWatermark || contentInfo.video.watermark;
      
      if (!videoUrl) {
        await bot.sendMessage(chatId, '❌ URL video tidak ditemukan');
        return;
      }

      const hasWatermark = !contentInfo.video.noWatermark;
      const watermarkText = hasWatermark ? '⚠️ _Video dengan watermark_' : '✅ _Video tanpa watermark_';

      await bot.sendMessage(chatId, '⬇️ Sedang mengunduh video...');

      try {
        // Download video dengan axios
        const videoResponse = await axios.get(videoUrl, {
          responseType: 'arraybuffer',
          timeout: 120000, // 2 menit timeout
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*'
          }
        });

        const videoBuffer = Buffer.from(videoResponse.data);

        // Kirim video
        await bot.sendVideo(chatId, videoBuffer, {
          caption: `🎵 *TikTok Video*\n\n👤 Author: ${contentInfo.author.nickname} (@${contentInfo.author.username})\n📝 ${contentInfo.title}\n🎵 Music: ${contentInfo.music.title} - ${contentInfo.music.author}\n⏱️ Duration: ${contentInfo.video.duration}s\n\n📊 ${formatStats(contentInfo.stats)}\n\n${watermarkText}`,
          parse_mode: 'Markdown',
          supports_streaming: true
        });

        console.log('✅ TikTok video sent successfully');

      } catch (videoError) {
        console.error('Error downloading video:', videoError);

        // Fallback: kirim sebagai URL jika download gagal
        await bot.sendMessage(chatId, 
          `🎵 *TikTok Video*\n\n👤 Author: ${contentInfo.author.nickname} (@${contentInfo.author.username})\n📝 ${contentInfo.title}\n🎵 Music: ${contentInfo.music.title} - ${contentInfo.music.author}\n⏱️ Duration: ${contentInfo.video.duration}s\n\n📊 ${formatStats(contentInfo.stats)}\n\n${watermarkText}`,
          { 
            parse_mode: 'Markdown',
            disable_web_page_preview: false
          }
        );
      }
    }

  } catch (error) {
    console.error('Error TikTok:', error);

    let errorMessage = '❌ Terjadi kesalahan saat memproses TikTok';

    if (error.code === 'ECONNABORTED') {
      errorMessage = '❌ Timeout: Video terlalu besar atau koneksi lambat. Coba lagi.';
    } else if (error.response?.status === 404) {
      errorMessage = '❌ Video tidak ditemukan. Link mungkin salah atau video sudah dihapus.';
    } else if (error.response?.status === 403) {
      errorMessage = '❌ Akses ditolak. Video mungkin di-private atau dibatasi.';
    } else if (error.message?.includes('Invalid')) {
      errorMessage = '❌ Format URL tidak valid. Pastikan menggunakan link TikTok yang benar.';
    }

    bot.editMessageText(errorMessage, {
      chat_id: chatId,
      message_id: processingMsg.message_id
    }).catch(() => {
      bot.sendMessage(chatId, errorMessage);
    });
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

// Handler untuk pesan yang tidak dikenali
bot.on('message', (msg) => {
  const text = msg.text;
  
  if (text && text.startsWith('/')) {
    if (!text.match(/^\/(start|tiktok|t|ig|hitamkan|remini)\b/)) {
      bot.sendMessage(msg.chat.id, '❌ Command tidak dikenali. Ketik /start untuk melihat menu bantuan.');
    }
  }
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
});