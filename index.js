require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const sharp = require('sharp');
const FormData = require('form-data');

// Konfigurasi dari environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const FERDEV_API_KEY = process.env.FERDEV_API_KEY;
const UPLOADER_URL = process.env.UPLOADER_URL; // URL uploader Anda

if (!BOT_TOKEN || !FERDEV_API_KEY) {
  console.error('Error: BOT_TOKEN dan FERDEV_API_KEY harus diisi di file .env');
  process.exit(1);
}

// Inisialisasi bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('Bot Telegram berhasil dijalankan!');

// Pesan help menu
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

// Fungsi untuk konversi gambar ke JPG
async function convertImageToJpg(buffer, sourceUrl = '') {
  try {
    const convertedBuffer = await sharp(buffer)
      .jpeg({ quality: 90 })
      .toBuffer();
    
    console.log(`✅ Image converted to JPG (source: ${sourceUrl})`);
    return convertedBuffer;
  } catch (error) {
    console.error('Error converting image:', error);
    return buffer;
  }
}

// Fungsi untuk upload gambar ke GitHub uploader
async function uploadImageToGitHub(imageBuffer, fileName) {
  try {
    const formData = new FormData();
    formData.append('file', imageBuffer, fileName);

    const response = await axios.post(`${UPLOADER_URL}/upload`, formData, {
      headers: {
        ...formData.getHeaders()
      },
      timeout: 30000
    });

    if (response.data && response.data.url) {
      console.log(`✅ Image uploaded to GitHub: ${response.data.url}`);
      return response.data.url;
    } else {
      throw new Error('Invalid response from uploader');
    }
  } catch (error) {
    console.error('Error uploading to GitHub:', error.message);
    throw error;
  }
}

// Fungsi untuk convert gambar ke hitam-putih menggunakan API
async function convertToBlackWhite(imageUrl) {
  try {
    const response = await axios.get('https://api.ferdev.my.id/maker/tohitam', {
      params: {
        link: imageUrl,  // Parameter yang benar adalah 'link', bukan 'url'
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
    console.error('Error converting to black & white:', error.message);
    throw error;
  }
}

// Command /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

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
  
  // Cek apakah user sedang menunggu untuk mengirim gambar
  if (waitingForImage[chatId]) {
    delete waitingForImage[chatId];
    await processHitamkan(chatId, msg);
  }
});

// Fungsi untuk memproses gambar menjadi hitam-putih
async function processHitamkan(chatId, msg) {
  const processingMsg = await bot.sendMessage(chatId, '⏳ Sedang memproses penghitaman...');

  try {
    // Ambil foto dengan resolusi tertinggi
    const photo = msg.photo[msg.photo.length - 1];
    const fileId = photo.file_id;

    // Download foto dari Telegram
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

    // Upload ke GitHub
    await bot.editMessageText('Proses penghitaman...', {
      chat_id: chatId,
      message_id: processingMsg.message_id
    });

    const fileName = `telegram_image_${Date.now()}.jpg`;
    const uploadedUrl = await uploadImageToGitHub(imageBuffer, fileName);

    // Konversi ke hitam-putih menggunakan API
    await bot.editMessageText('🎨 Berhasil menghitamkan!!!!!', {
      chat_id: chatId,
      message_id: processingMsg.message_id
    });

    const bwImageBuffer = await convertToBlackWhite(uploadedUrl);

    // Hapus pesan processing
    await bot.deleteMessage(chatId, processingMsg.message_id);

    // Kirim gambar hasil
    await bot.sendPhoto(chatId, bwImageBuffer, {
      caption: '⚫⚪ *Gambar Hitam-Putih*\n\nGambar berhasil diubah menjadi hitam-putih!',
      parse_mode: 'Markdown'
    });

    console.log('✅ Hitamkan process completed successfully');

  } catch (error) {
    console.error('Error processing hitamkan:', error);

    let errorMessage = '❌ Terjadi kesalahan saat memproses gambar';

    if (error.message.includes('upload')) {
      errorMessage = '❌ Gagal mengupload gambar ke server. Silakan coba lagi.';
    } else if (error.message.includes('tohitam')) {
      errorMessage = '❌ Gagal mengubah gambar ke hitam-putih. Silakan coba lagi.';
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = '❌ Timeout: Proses terlalu lama. Coba dengan gambar yang lebih kecil.';
    }

    bot.editMessageText(errorMessage, {
      chat_id: chatId,
      message_id: processingMsg.message_id
    });
  }
}

// Command /tiktok atau /t
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
      }
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

  } catch (error) {
    console.error('Error TikTok:', error.message);
    bot.editMessageText('❌ Terjadi kesalahan saat mengunduh video TikTok. Silakan coba lagi.', {
      chat_id: chatId,
      message_id: processingMsg.message_id
    });
  }
});

// Handler Instagram Video
async function handleInstagramVideo(chatId, responseData) {
  try {
    if (!responseData.videoUrls || responseData.videoUrls.length === 0) {
      await bot.sendMessage(chatId, '❌ Video tidak ditemukan');
      return;
    }

    const videoData = responseData.videoUrls[0];
    const ext = videoData.ext;
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

    if (ext === "mp4") {
      await bot.sendVideo(chatId, videoBuffer);
    } else if (ext === "webp") {
      await bot.sendMessage(chatId, '🔄 Mengonversi gambar ke JPG...');
      const convertedBuffer = await convertImageToJpg(videoBuffer, videoUrl);
      await bot.sendPhoto(chatId, convertedBuffer);
    }

    console.log(`✅ Instagram video sent successfully`);

  } catch (error) {
    console.error('Error handling Instagram video:', error);

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
    } else if (responseData.mediaUrls && responseData.mediaUrls.length > 0) {
      imageUrl = responseData.mediaUrls[0].url || responseData.mediaUrls[0];
    } else if (responseData.url) {
      imageUrl = responseData.url;
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });

    const contentType = imageResponse.headers['content-type'] || '';
    const urlLower = imageUrl.toLowerCase();
    const originalBuffer = Buffer.from(imageResponse.data);
    
    const isAlreadyJpg = (contentType.includes('jpeg') || contentType.includes('jpg')) ||
                        (urlLower.includes('.jpg') || urlLower.includes('.jpeg'));
    
    const needsConversion = !isAlreadyJpg || 
                           contentType.includes('heic') || 
                           contentType.includes('webp') ||
                           contentType.includes('png') ||
                           contentType.includes('gif') ||
                           urlLower.includes('.heic') || 
                           urlLower.includes('.webp') ||
                           urlLower.includes('.png') ||
                           urlLower.includes('.gif');

    if (needsConversion) {
      await bot.sendMessage(chatId, '🔄 Mengonversi gambar ke JPG...');
      const convertedBuffer = await convertImageToJpg(originalBuffer, imageUrl);
      await bot.sendPhoto(chatId, convertedBuffer);
      console.log(`✅ Instagram image converted and sent (${contentType || 'unknown'} -> JPEG)`);
    } else {
      await bot.sendPhoto(chatId, originalBuffer);
      console.log(`✅ Instagram image sent (already JPEG)`);
    }

  } catch (error) {
    console.error('Error handling Instagram image:', error);

    if (error.code === 'ECONNABORTED') {
      await bot.sendMessage(chatId, '❌ Timeout: Gambar terlalu besar atau koneksi lambat');
    } else if (error.response?.status === 403) {
      await bot.sendMessage(chatId, '❌ Akses ke gambar ditolak. Coba link lain');
    } else if (error.response?.status === 404) {
      await bot.sendMessage(chatId, '❌ Gambar tidak ditemukan atau sudah dihapus');
    } else {
      await bot.sendMessage(chatId, '❌ Gagal mengunduh gambar Instagram');
    }
  }
}

// Handler Instagram Carousel
async function handleInstagramCarousel(chatId, responseData) {
  try {
    if (!responseData.slides || responseData.slides.length === 0) {
      await bot.sendMessage(chatId, '❌ Konten carousel tidak ditemukan');
      return;
    }

    await bot.sendMessage(chatId, `⬇️ Sedang mengunduh ${responseData.slides.length} media dari carousel...`);

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
          console.log(`❌ Media URL tidak ditemukan untuk slide ${i + 1}`);
          failCount++;
          continue;
        }

        const mediaResponse = await axios.get(mediaUrl, {
          responseType: 'arraybuffer',
          timeout: 45000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'image/*,video/*,*/*;q=0.8'
          }
        });

        const contentType = mediaResponse.headers['content-type'] || '';
        const mediaBuffer = Buffer.from(mediaResponse.data);
        const slideType = slide.mediaUrls?.[0]?.type || '';
        const urlExt = mediaUrl.toLowerCase();

        if (contentType.includes('video') ||
            slideType === 'mp4' ||
            urlExt.includes('.mp4') ||
            urlExt.includes('video')) {

          await bot.sendVideo(chatId, mediaBuffer);

        } else {
          const needsConversion = contentType.includes('heic') || 
                                 contentType.includes('webp') ||
                                 urlExt.includes('.heic') || 
                                 urlExt.includes('.webp') ||
                                 urlExt.includes('.png') ||
                                 slideType === 'heic';

          let finalBuffer = mediaBuffer;

          if (needsConversion) {
            finalBuffer = await convertImageToJpg(mediaBuffer, mediaUrl);
            console.log(`🔄 Carousel media ${i + 1} converted to JPG`);
          }

          await bot.sendPhoto(chatId, finalBuffer);
        }

        successCount++;
        console.log(`✅ Carousel media ${i + 1} sent successfully (${contentType || 'unknown type'})`);

        if (i < responseData.slides.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }

      } catch (mediaError) {
        console.error(`Error downloading carousel media ${i + 1}:`, mediaError);
        failCount++;
        continue;
      }
    }

    if (successCount > 0) {
      const summaryMessage = failCount > 0
        ? `✅ Berhasil mengunduh ${successCount} media, ${failCount} gagal`
        : `✅ Semua ${successCount} media berhasil diunduh`;

      await new Promise(resolve => setTimeout(resolve, 1000));
      await bot.sendMessage(chatId, summaryMessage);
    } else {
      await bot.sendMessage(chatId, '❌ Gagal mengunduh semua media dari carousel');
    }

    console.log(`✅ Instagram carousel processed: ${successCount} success, ${failCount} failed`);

  } catch (error) {
    console.error('Error handling Instagram carousel:', error);
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

  const processingMsg = await bot.sendMessage(chatId, '⏳ Sedang memproses media Instagram...');

  try {
    const { data } = await axios.get('https://api.ferdev.my.id/downloader/instagram', {
      params: {
        link: url,
        apikey: FERDEV_API_KEY
      },
      timeout: 30000
    });

    if (!data || !data.success) {
      bot.editMessageText('❌ Gagal mendownload konten Instagram\nSilakan coba lagi', {
        chat_id: chatId,
        message_id: processingMsg.message_id
      });
      return;
    }

    const responseData = data.data;

    if (!responseData || !responseData.success) {
      bot.editMessageText('❌ Gagal memproses konten Instagram\nSilakan coba lagi', {
        chat_id: chatId,
        message_id: processingMsg.message_id
      });
      return;
    }

    await bot.deleteMessage(chatId, processingMsg.message_id);

    let isActuallyImage = false;
    let isActuallyVideo = false;

    if (responseData.videoUrls && responseData.videoUrls.length > 0) {
      const mediaItem = responseData.videoUrls[0];
      const mediaType = mediaItem.type || mediaItem.ext || '';
      
      if (mediaType.toLowerCase().includes('heic') || 
          mediaType.toLowerCase().includes('jpg') || 
          mediaType.toLowerCase().includes('jpeg') || 
          mediaType.toLowerCase().includes('png') || 
          mediaType.toLowerCase().includes('webp') ||
          mediaType.toLowerCase().includes('image')) {
        isActuallyImage = true;
      } else if (mediaType.toLowerCase().includes('mp4') || 
                mediaType.toLowerCase().includes('video')) {
        isActuallyVideo = true;
      }
    }

    if (responseData.thumbnailUrl && !isActuallyVideo) {
      isActuallyImage = true;
    }

    if (isActuallyVideo || (responseData.type === 'video' && !isActuallyImage)) {
      await handleInstagramVideo(chatId, responseData);
    } else if (isActuallyImage || responseData.type === 'image' || responseData.thumbnailUrl) {
      await handleInstagramImage(chatId, responseData);
    } else if (responseData.type === 'slide') {
      await handleInstagramCarousel(chatId, responseData);
    } else {
      if (responseData.thumbnailUrl) {
        await handleInstagramImage(chatId, responseData);
      } else {
        await bot.sendMessage(chatId, '❌ Tipe konten Instagram tidak didukung');
      }
    }

  } catch (error) {
    console.error('Error processing Instagram download:', error);

    if (error.code === 'ECONNABORTED') {
      bot.editMessageText('❌ Timeout: Server terlalu lambat merespons', {
        chat_id: chatId,
        message_id: processingMsg.message_id
      });
    } else if (error.response?.status === 429) {
      bot.editMessageText('❌ Terlalu banyak request. Coba lagi dalam beberapa menit', {
        chat_id: chatId,
        message_id: processingMsg.message_id
      });
    } else {
      bot.editMessageText('❌ Terjadi kesalahan saat mendownload', {
        chat_id: chatId,
        message_id: processingMsg.message_id
      });
    }
  }
});

// Handler untuk pesan yang tidak dikenali
bot.on('message', (msg) => {
  const text = msg.text;
  
  if (text && text.startsWith('/')) {
    if (!text.match(/^\/(start|tiktok|t|ig|hitamkan)\b/)) {
      bot.sendMessage(msg.chat.id, '❌ Command tidak dikenali. Ketik /start untuk melihat menu bantuan.');
    }
  }
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
});