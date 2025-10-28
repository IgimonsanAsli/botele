const axios = require('axios');
const sharp = require('sharp');

class InstagramHandler {
  constructor(bot, apiKey) {
    this.bot = bot;
    this.apiKey = apiKey;
  }

  // Fungsi untuk konversi gambar ke JPG
  async convertImageToJpg(buffer, sourceUrl = '') {
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

  // Handler Instagram Video
  async handleVideo(chatId, responseData) {
    try {
      if (!responseData.videoUrls || responseData.videoUrls.length === 0) {
        await this.bot.sendMessage(chatId, '❌ Video tidak ditemukan');
        return;
      }

      const videoData = responseData.videoUrls[0];
      const ext = videoData.ext;
      const videoUrl = videoData.url;

      if (!videoUrl) {
        await this.bot.sendMessage(chatId, '❌ Link video tidak valid');
        return;
      }

      await this.bot.sendMessage(chatId, '⬇️ Sedang mengunduh video...');

      const videoResponse = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const videoBuffer = Buffer.from(videoResponse.data);

      if (ext === "mp4") {
        await this.bot.sendVideo(chatId, videoBuffer);
      } else if (ext === "webp") {
        await this.bot.sendMessage(chatId, '🔄 Mengonversi gambar ke JPG...');
        const convertedBuffer = await this.convertImageToJpg(videoBuffer, videoUrl);
        await this.bot.sendPhoto(chatId, convertedBuffer);
      }

      console.log(`✅ Instagram video sent successfully`);

    } catch (error) {
      console.error('Error handling Instagram video:', error);

      if (error.code === 'ECONNABORTED') {
        await this.bot.sendMessage(chatId, '❌ Timeout: Video terlalu besar atau koneksi lambat');
      } else if (error.response?.status === 403) {
        await this.bot.sendMessage(chatId, '❌ Akses ke video ditolak. Coba link lain');
      } else if (error.response?.status === 404) {
        await this.bot.sendMessage(chatId, '❌ Video tidak ditemukan atau sudah dihapus');
      } else {
        await this.bot.sendMessage(chatId, '❌ Gagal mengunduh video Instagram');
      }
    }
  }

  // Handler Instagram Image
  async handleImage(chatId, responseData) {
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
        await this.bot.sendMessage(chatId, '❌ Gambar tidak ditemukan');
        return;
      }

      await this.bot.sendMessage(chatId, '⬇️ Sedang memproses gambar...');

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
        await this.bot.sendMessage(chatId, '🔄 Mengonversi gambar ke JPG...');
        const convertedBuffer = await this.convertImageToJpg(originalBuffer, imageUrl);
        await this.bot.sendPhoto(chatId, convertedBuffer);
        console.log(`✅ Instagram image converted and sent (${contentType || 'unknown'} -> JPEG)`);
      } else {
        await this.bot.sendPhoto(chatId, originalBuffer);
        console.log(`✅ Instagram image sent (already JPEG)`);
      }

    } catch (error) {
      console.error('Error handling Instagram image:', error);

      if (error.code === 'ECONNABORTED') {
        await this.bot.sendMessage(chatId, '❌ Timeout: Gambar terlalu besar atau koneksi lambat');
      } else if (error.response?.status === 403) {
        await this.bot.sendMessage(chatId, '❌ Akses ke gambar ditolak. Coba link lain');
      } else if (error.response?.status === 404) {
        await this.bot.sendMessage(chatId, '❌ Gambar tidak ditemukan atau sudah dihapus');
      } else {
        await this.bot.sendMessage(chatId, '❌ Gagal mengunduh gambar Instagram');
      }
    }
  }

  // Handler Instagram Carousel
  async handleCarousel(chatId, responseData) {
    try {
      if (!responseData.slides || responseData.slides.length === 0) {
        await this.bot.sendMessage(chatId, '❌ Konten carousel tidak ditemukan');
        return;
      }

      await this.bot.sendMessage(chatId, `⬇️ Sedang mengunduh ${responseData.slides.length} media dari carousel...`);

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

            await this.bot.sendVideo(chatId, mediaBuffer);

          } else {
            const needsConversion = contentType.includes('heic') || 
                                   contentType.includes('webp') ||
                                   urlExt.includes('.heic') || 
                                   urlExt.includes('.webp') ||
                                   urlExt.includes('.png') ||
                                   slideType === 'heic';

            let finalBuffer = mediaBuffer;

            if (needsConversion) {
              finalBuffer = await this.convertImageToJpg(mediaBuffer, mediaUrl);
              console.log(`🔄 Carousel media ${i + 1} converted to JPG`);
            }

            await this.bot.sendPhoto(chatId, finalBuffer);
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
        await this.bot.sendMessage(chatId, summaryMessage);
      } else {
        await this.bot.sendMessage(chatId, '❌ Gagal mengunduh semua media dari carousel');
      }

      console.log(`✅ Instagram carousel processed: ${successCount} success, ${failCount} failed`);

    } catch (error) {
      console.error('Error handling Instagram carousel:', error);
      await this.bot.sendMessage(chatId, '❌ Gagal memproses carousel Instagram');
    }
  }

  // Main handler untuk command /ig
  async handleCommand(msg, match) {
    const chatId = msg.chat.id;
    const url = match[1].trim();

    if (!url) {
      this.bot.sendMessage(chatId, '❌ Mohon masukkan URL Instagram!\nContoh: /ig https://www.instagram.com/p/xxxxx');
      return;
    }

    const processingMsg = await this.bot.sendMessage(chatId, '⏳ Sedang memproses media Instagram...');

    try {
      const { data } = await axios.get('https://api.ferdev.my.id/downloader/instagram', {
        params: {
          link: url,
          apikey: this.apiKey
        },
        timeout: 30000
      });

      if (!data || !data.success) {
        this.bot.editMessageText('❌ Gagal mendownload konten Instagram\nSilakan coba lagi', {
          chat_id: chatId,
          message_id: processingMsg.message_id
        });
        return;
      }

      const responseData = data.data;

      if (!responseData || !responseData.success) {
        this.bot.editMessageText('❌ Gagal memproses konten Instagram\nSilakan coba lagi', {
          chat_id: chatId,
          message_id: processingMsg.message_id
        });
        return;
      }

      await this.bot.deleteMessage(chatId, processingMsg.message_id);

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
        await this.handleVideo(chatId, responseData);
      } else if (isActuallyImage || responseData.type === 'image' || responseData.thumbnailUrl) {
        await this.handleImage(chatId, responseData);
      } else if (responseData.type === 'slide') {
        await this.handleCarousel(chatId, responseData);
      } else {
        if (responseData.thumbnailUrl) {
          await this.handleImage(chatId, responseData);
        } else {
          await this.bot.sendMessage(chatId, '❌ Tipe konten Instagram tidak didukung');
        }
      }

    } catch (error) {
      console.error('Error processing Instagram download:', error);

      if (error.code === 'ECONNABORTED') {
        this.bot.editMessageText('❌ Timeout: Server terlalu lambat merespons', {
          chat_id: chatId,
          message_id: processingMsg.message_id
        });
      } else if (error.response?.status === 429) {
        this.bot.editMessageText('❌ Terlalu banyak request. Coba lagi dalam beberapa menit', {
          chat_id: chatId,
          message_id: processingMsg.message_id
        });
      } else {
        this.bot.editMessageText('❌ Terjadi kesalahan saat mendownload', {
          chat_id: chatId,
          message_id: processingMsg.message_id
        });
      }
    }
  }

  // Method untuk register command ke bot
  register() {
    this.bot.onText(/\/ig\s+(.+)/, (msg, match) => this.handleCommand(msg, match));
  }
}

module.exports = InstagramHandler;