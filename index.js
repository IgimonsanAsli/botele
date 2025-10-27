require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const sharp = require('sharp');
const FormData = require('form-data');

// ========================================
// KONFIGURASI
// ========================================
const BOT_TOKEN = process.env.BOT_TOKEN;
const FERDEV_API_KEY = process.env.FERDEV_API_KEY;
const UPLOADER_URL = process.env.UPLOADER_URL; // Contoh: https://your-app.railway.app

// Validasi environment variables
if (!BOT_TOKEN || !FERDEV_API_KEY || !UPLOADER_URL) {
  console.error('❌ Error: Environment variables tidak lengkap!');
  console.error('Pastikan sudah set:');
  console.error('- BOT_TOKEN');
  console.error('- FERDEV_API_KEY');
  console.error('- UPLOADER_URL');
  process.exit(1);
}

// Inisialisasi bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('✅ Bot Telegram berhasil dijalankan!');
console.log(`📡 Uploader URL: ${UPLOADER_URL}`);

// ========================================
// HELP MESSAGE
// ========================================
const helpMessage = `
🤖 *Selamat datang di Bot Downloader!*

📱 *Fitur yang tersedia:*

🎵 *TikTok Downloader*
• /tiktok <url> - Download video TikTok
• /t <url> - Shortcut untuk TikTok

📸 *Instagram Downloader*
• /ig <url> - Download video/foto/carousel Instagram

⚫ *Image to Black & White*
• /hitamkan - Kirim gambar untuk diubah jadi hitam-putih
• Reply gambar dengan /hitamkan

💡 *Contoh penggunaan:*
\`/tiktok https://vt.tiktok.com/xxxxx\`
\`/t https://vt.tiktok.com/xxxxx\`
\`/ig https://www.instagram.com/p/xxxxx\`
\`/hitamkan\` (lalu kirim gambar)

_Bot ini mendukung video, foto, dan carousel!_
`;

// ========================================
// UTILITY FUNCTIONS
// ========================================

// Fungsi untuk konversi gambar ke JPG
async function convertImageToJpg(buffer, sourceUrl = '') {
  try {
    const convertedBuffer = await sharp(buffer)
      .jpeg({ quality: 90 })
      .toBuffer();
    
    console.log(`✅ Image converted to JPG (source: ${sourceUrl})`);
    return convertedBuffer;
  } catch (error) {
    console.error('❌ Error converting image:', error.message);
    throw error;
  }
}

// Fungsi untuk upload gambar ke GitHub uploader
async function uploadImageToGitHub(imageBuffer, fileName) {
  try {
    const formData = new FormData();
    formData.append('file', imageBuffer, fileName);

    console.log(`📤 Uploading ${fileName} to GitHub...`);

    const response = await axios.post(`${UPLOADER_URL}/upload`, formData, {
      headers: {
        ...formData.getHeaders()
      },
      timeout: 60000, // 60 detik timeout
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    if (response.data && response.data.url) {
      console.log(`✅ Image uploaded: ${response.data.url}`);
      console.log(`⏰ Expires at: ${response.data.expiresAt}`);
      return response.data.url;
    } else {
      throw new Error('Invalid response from uploader');
    }
  } catch (error) {
    console.error('❌ Error uploading to GitHub:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw new Error(`Upload failed: ${error.message}`);
  }
}

// Fungsi untuk convert gambar ke hitam-putih menggunakan API
async function convertToBlackWhite(imageUrl) {
  try {
    console.log(`🎨 Converting to B&W: ${imageUrl}`);
    
    const response = await axios.get('https://api.ferdev.my.id/maker/tohitam', {
      params: {
        link: imageUrl,
        apikey: FERDEV_API_KEY
      },
      responseType: 'arraybuffer',
      timeout: 60000
    });

    if (response.data) {
      console.log('✅ Image converted to black & white successfully');
      return Buffer.from(response.data);
    } else {
      throw new Error('Invalid response from tohitam API');
    }
  } catch (error) {
    console.error('❌ Error converting to black & white:', error.message);
    throw new Error(`Conversion failed: ${error.message}`);
  }
}

// Fungsi untuk cek status uploader
async function checkUploaderStatus() {
  try {
    const response = await axios.get(`${UPLOADER_URL}/health`, {
      timeout: 10000
    });
    
    if (response.data && response.data.status === 'ok') {
      console.log('✅ Uploader service is healthy');
      return true;
    }
    return false;
  } catch (error) {
    console.error('⚠️  Uploader service health check failed:', error.message);
    return false;
  }
}

// ========================================
// BOT COMMANDS
// ========================================

// Command /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// Command /status - Cek status uploader
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  const statusMsg = await bot.sendMessage(chatId, '🔍 Checking uploader status...');
  
  try {
    const response = await axios.get(`${UPLOADER_URL}/health`, { timeout: 10000 });
    
    if (response.data) {
      const status = response.data;
      const configStatus = status.config || {};
      
      const message = `
✅ *Uploader Status*

📊 Status: ${status.status === 'ok' ? '✅ Online' : '❌ Offline'}
⏰ Time: ${status.timestamp}

🔧 *Configuration:*
• Owner: ${configStatus.owner === '✓' ? '✅' : '❌'}
• Repo: ${configStatus.repo === '✓' ? '✅' : '❌'}
• Token: ${configStatus.token === '✓' ? '✅' : '❌'}

🔗 URL: ${UPLOADER_URL}
      `;
      
      bot.editMessageText(message, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });
    }
  } catch (error) {
    bot.editMessageText('❌ Uploader service is offline or unreachable', {
      chat_id: chatId,
      message_id: statusMsg.message_id
    });
  }
});

// ========================================
// HITAMKAN FEATURE
// ========================================

// Command /hitamkan
bot.onText(/\/hitamkan/, async (msg) => {
  const chatId = msg.chat.id;

  // Cek apakah ini reply ke gambar
  if (msg.reply_to_message && msg.reply_to_message.photo) {
    await processHitamkan(chatId, msg.reply_to_message);
  } else {
    bot.sendMessage(chatId, '📸 Silakan kirim gambar yang ingin dihitamkan, atau reply gambar dengan /hitamkan');
  }
});

// Handler untuk menerima gambar setelah command /hitamkan
let waitingForImage = {};

bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  
  if (waitingForImage[chatId]) {
    delete waitingForImage[chatId];
    await processHitamkan(chatId, msg);
  }
});

// Fungsi untuk memproses gambar menjadi hitam-putih
async function processHitamkan(chatId, msg) {
  const processingMsg = await bot.sendMessage(chatId, '⏳ Memulai proses penghitaman...');

  try {
    // 1. Ambil foto dengan resolusi tertinggi
    const photo = msg.photo[msg.photo.length - 1];
    const fileId = photo.file_id;

    // 2. Download foto dari Telegram
    await bot.editMessageText('⬇️ Mengunduh gambar dari Telegram...', {
      chat_id: chatId,
      message_id: processingMsg.message_id
    });

    const fileLink = await bot.getFileLink(fileId);
    const imageResponse = await axios.get(fileLink, {
      responseType: 'arraybuffer',
      timeout: 30000
    });

    const imageBuffer = Buffer.from(imageResponse.data);
    console.log(`📥 Image downloaded: ${(imageBuffer.length / 1024).toFixed(2)} KB`);

    // 3. Konversi ke JPG jika perlu
    await bot.editMessageText('🔄 Memproses gambar...', {
      chat_id: chatId,
      message_id: processingMsg.message_id
    });

    const jpgBuffer = await convertImageToJpg(imageBuffer, 'telegram_photo');

    // 4. Upload ke GitHub
    await bot.editMessageText('📤 Mengupload ke server...', {
      chat_id: chatId,
      message_id: processingMsg.message_id
    });

    const fileName = `telegram_${Date.now()}.jpg`;
    const uploadedUrl = await uploadImageToGitHub(jpgBuffer, fileName);

    // 5. Konversi ke hitam-putih menggunakan API
    await bot.editMessageText('🎨 Mengubah ke hitam-putih...', {
      chat_id: chatId,
      message_id: processingMsg.message_id
    });

    const bwImageBuffer = await convertToBlackWhite(uploadedUrl);

    // 6. Hapus pesan processing
    await bot.deleteMessage(chatId, processingMsg.message_id);

    // 7. Kirim gambar hasil
    await bot.sendPhoto(chatId, bwImageBuffer, {
      caption: '⚫⚪ *Gambar Hitam-Putih*\n\n✅ Gambar berhasil diubah menjadi hitam-putih!\n\n_File temporary akan dihapus otomatis dalam 24 jam_',
      parse_mode: 'Markdown'
    });

    console.log('✅ Hitamkan process completed successfully');

  } catch (error) {
    console.error('❌ Error processing hitamkan:', error);

    let errorMessage = '❌ Terjadi kesalahan saat memproses gambar';

    if (error.message.includes('Upload failed')) {
      errorMessage = '❌ Gagal mengupload gambar ke server.\n\nKemungkinan:\n• Server uploader offline\n• Koneksi terputus\n\nSilakan coba lagi atau cek /status';
    } else if (error.message.includes('Conversion failed')) {
      errorMessage = '❌ Gagal mengubah gambar ke hitam-putih.\n\nSilakan coba lagi dengan gambar lain.';
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = '❌ Timeout: Proses terlalu lama.\n\nCoba dengan gambar yang lebih kecil.';
    }

    bot.editMessageText(errorMessage, {
      chat_id: chatId,
      message_id: processingMsg.message_id
    });
  }
}

// ========================================
// TIKTOK DOWNLOADER
// ========================================

bot.onText(/\/(tiktok|t)\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const url = match[2].trim();

  if (!url) {
    bot.sendMessage(chatId, '❌ Mohon masukkan URL TikTok!\nContoh: /tiktok https://vt.tiktok.com/xxxxx');
    return;
  }

  const processingMsg = await bot.sendMessage(chatId, '⏳ Sedang memproses video TikTok...');

  try {
    const response = await axios.get('https://www.tikwm.com/api/', {
      params: {
        url: url,
        hd: 1
      },
      timeout: 30000
    });

    if (response.data.code !== 0 || !response.data.data) {
      bot.editMessageText('❌ Gagal mengunduh video. Pastikan URL valid!', {
        chat_id: chatId,
        message_id: processingMsg.message_id
      });
      return;
    }

    const data = response.data.data;
    const videoUrl = data.hdplay || data.play || data.wmplay;
    const title = data.title || 'TikTok Video';
    const author = data.author?.unique_id || 'Unknown';

    if (!videoUrl) {
      bot.editMessageText('❌ URL video tidak ditemukan!', {
        chat_id: chatId,
        message_id: processingMsg.message_id
      });
      return;
    }

    await bot.deleteMessage(chatId, processingMsg.message_id);

    await bot.sendVideo(chatId, videoUrl, {
      caption: `🎵 *TikTok Video*\n\n👤 Author: @${author}\n📝 ${title}`,
      parse_mode: 'Markdown'
    });

    console.log('✅ TikTok video sent successfully');

  } catch (error) {
    console.error('❌ Error TikTok:', error.message);
    bot.editMessageText('❌ Terjadi kesalahan saat mengunduh video TikTok. Silakan coba lagi.', {
      chat_id: chatId,
      message_id: processingMsg.message_id
    });
  }
});

// ========================================
// INSTAGRAM DOWNLOADER
// ========================================

// Handler Instagram Video
async function handleInstagramVideo(chatId, responseData) {
  try {
    if (!responseData.videoUrls || responseData.videoUrls.length === 0) {
      await bot.sendMessage(chatId, '❌ Video tidak ditemukan');
      return;
    }

    const videoData = responseData.videoUrls[0];
    const videoUrl = videoData.url;

    if (!videoUrl) {
      await bot.sendMessage(chatId, '❌ Link video tidak valid');
      return;
    }

    await bot.sendMessage(chatId, '⬇️ Sedang mengunduh video...');

    const videoResponse = await axios.get(videoUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const videoBuffer = Buffer.from(videoResponse.data);
    await bot.sendVideo(chatId, videoBuffer);

    console.log('✅ Instagram video sent successfully');

  } catch (error) {
    console.error('❌ Error handling Instagram video:', error.message);

    if (error.code === 'ECONNABORTED') {
      await bot.sendMessage(chatId, '❌ Timeout: Video terlalu besar atau koneksi lambat');
    } else if (error.response?.status === 403) {
      await bot.sendMessage(chatId, '❌ Akses ke video ditolak. Coba link lain');
    } else if (error.response?.status === 404) {
      await bot.sendMessage(chatId, '❌ Video tidak ditemukan atau sudah dihapus');
    } else {
      await bot.sendMessage(chatId, '❌ Gagal mengunduh video Instagram');
    }
  }
}

// Handler Instagram Image
async function handleInstagramImage(chatId, responseData) {
  try {
    let imageUrl;

    if (responseData.thumbnailUrl) {
      imageUrl = responseData.thumbnailUrl;
    } else if (responseData.videoUrls && responseData.videoUrls.length > 0) {
      const mediaItem = responseData.videoUrls[0];
      if (mediaItem && (mediaItem.type === 'heic' || mediaItem.ext === 'heic' || 
                       mediaItem.type === 'image' || mediaItem.ext === 'jpg' || 
                       mediaItem.ext === 'jpeg' || mediaItem.ext === 'png')) {
        imageUrl = mediaItem.url;
      }
    } else if (responseData.imageUrls && responseData.imageUrls.length > 0) {
      imageUrl = responseData.imageUrls[0].url || responseData.imageUrls[0];
    }

    if (!imageUrl) {
      await bot.sendMessage(chatId, '❌ Gambar tidak ditemukan');
      return;
    }

    await bot.sendMessage(chatId, '⬇️ Sedang mengunduh gambar...');

    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const originalBuffer = Buffer.from(imageResponse.data);
    const convertedBuffer = await convertImageToJpg(originalBuffer, imageUrl);
    
    await bot.sendPhoto(chatId, convertedBuffer);
    console.log('✅ Instagram image sent successfully');

  } catch (error) {
    console.error('❌ Error handling Instagram image:', error.message);
    await bot.sendMessage(chatId, '❌ Gagal mengunduh gambar Instagram');
  }
}

// Handler Instagram Carousel
async function handleInstagramCarousel(chatId, responseData) {
  try {
    if (!responseData.slides || responseData.slides.length === 0) {
      await bot.sendMessage(chatId, '❌ Konten carousel tidak ditemukan');
      return;
    }

    await bot.sendMessage(chatId, `⬇️ Mengunduh ${responseData.slides.length} media dari carousel...`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < responseData.slides.length; i++) {
      const slide = responseData.slides[i];

      try {
        let mediaUrl;
        if (slide.mediaUrls && slide.mediaUrls.length > 0) {
          mediaUrl = slide.mediaUrls[0].url;
        } else if (slide.url) {
          mediaUrl = slide.url;
        }

        if (!mediaUrl) {
          failCount++;
          continue;
        }

        const mediaResponse = await axios.get(mediaUrl, {
          responseType: 'arraybuffer',
          timeout: 45000,
          headers: {
            'User-Agent': 'Mozilla/5.0'
          }
        });

        const contentType = mediaResponse.headers['content-type'] || '';
        const mediaBuffer = Buffer.from(mediaResponse.data);

        if (contentType.includes('video') || mediaUrl.toLowerCase().includes('.mp4')) {
          await bot.sendVideo(chatId, mediaBuffer);
        } else {
          const convertedBuffer = await convertImageToJpg(mediaBuffer, mediaUrl);
          await bot.sendPhoto(chatId, convertedBuffer);
        }

        successCount++;
        console.log(`✅ Carousel media ${i + 1}/${responseData.slides.length} sent`);

        if (i < responseData.slides.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }

      } catch (mediaError) {
        console.error(`❌ Error carousel media ${i + 1}:`, mediaError.message);
        failCount++;
      }
    }

    const summaryMessage = failCount > 0
      ? `✅ Berhasil: ${successCount}, Gagal: ${failCount}`
      : `✅ Semua ${successCount} media berhasil diunduh`;

    await bot.sendMessage(chatId, summaryMessage);

  } catch (error) {
    console.error('❌ Error handling carousel:', error.message);
    await bot.sendMessage(chatId, '❌ Gagal memproses carousel Instagram');
  }
}

// Command /ig - Main Instagram Handler
bot.onText(/\/ig\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const url = match[1].trim();

  if (!url) {
    bot.sendMessage(chatId, '❌ Mohon masukkan URL Instagram!\nContoh: /ig https://www.instagram.com/p/xxxxx');
    return;
  }

  const processingMsg = await bot.sendMessage(chatId, '⏳ Memproses media Instagram...');

  try {
    const { data } = await axios.get('https://api.ferdev.my.id/downloader/instagram', {
      params: {
        link: url,
        apikey: FERDEV_API_KEY
      },
      timeout: 30000
    });

    if (!data || !data.success || !data.data || !data.data.success) {
      bot.editMessageText('❌ Gagal mendownload konten Instagram', {
        chat_id: chatId,
        message_id: processingMsg.message_id
      });
      return;
    }

    const responseData = data.data;
    await bot.deleteMessage(chatId, processingMsg.message_id);

    // Deteksi tipe konten
    if (responseData.type === 'video') {
      await handleInstagramVideo(chatId, responseData);
    } else if (responseData.type === 'image') {
      await handleInstagramImage(chatId, responseData);
    } else if (responseData.type === 'slide') {
      await handleInstagramCarousel(chatId, responseData);
    } else {
      await bot.sendMessage(chatId, '❌ Tipe konten tidak didukung');
    }

  } catch (error) {
    console.error('❌ Error Instagram:', error.message);
    
    bot.editMessageText('❌ Terjadi kesalahan saat mendownload', {
      chat_id: chatId,
      message_id: processingMsg.message_id
    });
  }
});

// ========================================
// ERROR HANDLERS
// ========================================

// Handler untuk pesan yang tidak dikenali
bot.on('message', (msg) => {
  const text = msg.text;
  
  if (text && text.startsWith('/')) {
    if (!text.match(/^\/(start|tiktok|t|ig|hitamkan|status)\b/)) {
      bot.sendMessage(msg.chat.id, '❌ Command tidak dikenali. Ketik /start untuk melihat menu bantuan.');
    }
  }
});

// Error handling untuk polling
bot.on('polling_error', (error) => {
  console.error('❌ Polling error:', error.message);
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

// Cek uploader status saat startup
setTimeout(async () => {
  const isHealthy = await checkUploaderStatus();
  if (!isHealthy) {
    console.warn('⚠️  Warning: Uploader service might be offline');
    console.warn('Check your UPLOADER_URL:', UPLOADER_URL);
  }
}, 3000);