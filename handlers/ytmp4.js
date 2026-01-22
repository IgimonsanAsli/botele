const axios = require('axios');

class YtMp4Handler {
  constructor(bot, apiKey) {
    this.bot = bot;
    this.apiKey = apiKey;
    this.apiUrl = 'https://api.ferdev.my.id/downloader/ytmp4';
  }

  register() {
    // Command /ytmp4
    this.bot.onText(/\/ytmp4(?:\s+(.+))?/, (msg, match) => this.handleCommand(msg, match));
  }

  async handleCommand(msg, match) {
    const chatId = msg.chat.id;
    const url = match[1];

    if (!url) {
      await this.bot.sendMessage(
        chatId,
        '❌ <b>Cara penggunaan:</b>\n\n' +
        '<code>/ytmp4 &lt;link_youtube&gt;</code>\n\n' +
        '<b>Contoh:</b>\n' +
        '<code>/ytmp4 https://youtu.be/xxxxx</code>\n' +
        '<code>/ytmp4 https://youtube.com/watch?v=xxxxx</code>',
        { parse_mode: 'HTML' }
      );
      return;
    }

    await this.processYtMp4(chatId, url);
  }

  async processYtMp4(chatId, url) {
    let statusMsg;

    try {
      // Kirim status processing
      statusMsg = await this.bot.sendMessage(
        chatId,
        '⏳ Memproses video YouTube...'
      );

      console.log(`🎬 Processing YouTube MP4: ${url}`);

      // Panggil API
      const response = await axios.get(this.apiUrl, {
        params: {
          link: url,
          apikey: this.apiKey
        },
        timeout: 60000 // 60 detik timeout
      });

      const data = response.data;

      // Validasi response
      if (!data.success || !data.data) {
        throw new Error('Invalid API response');
      }

      const metadata = data.data.metadata;
      const downloadLink = data.data.dlink;

      if (!downloadLink) {
        throw new Error('Download link tidak tersedia');
      }

      // Cek durasi video - tolak jika terlalu panjang
      const durationInSeconds = metadata.duration?.seconds || 0;
      const MAX_DURATION = 600; // 10 menit (600 detik)

      if (durationInSeconds > MAX_DURATION) {
        throw new Error(
          `Video terlalu panjang (${metadata.duration.timestamp}). ` +
          `Maksimal 10 menit untuk menghemat resource server.`
        );
      }

      // Update status
      await this.bot.editMessageText(
        '📥 Mendownload video...\n' +
        `⏱️ Durasi: ${metadata.duration?.timestamp || 'N/A'}`,
        {
          chat_id: chatId,
          message_id: statusMsg.message_id
        }
      );

      // Escape HTML entities
      const escapeHtml = (text) => {
        if (!text) return 'N/A';
        return text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      };

      // Format caption dengan HTML parse mode
      const caption =
        `🎬 <b>${escapeHtml(metadata.title)}</b>\n\n` +
        `👤 <b>Author:</b> ${escapeHtml(metadata.author)}\n` +
        `⏱️ <b>Duration:</b> ${metadata.duration?.timestamp || 'N/A'}\n` +
        `👁️ <b>Views:</b> ${this.formatNumber(metadata.viewers)}\n` +
        `📅 <b>Upload:</b> ${escapeHtml(metadata.upload)}\n\n` +
        `<i>Downloaded by @igimonsanbot</i>`;

      // Kirim thumbnail terlebih dahulu
      let thumbnailMsg;
      if (metadata.thumbnail) {
        try {
          thumbnailMsg = await this.bot.sendPhoto(chatId, metadata.thumbnail, {
            caption: `🖼️ <b>Thumbnail</b>\n${escapeHtml(metadata.title)}\n\n<i>Memulai download...</i>`,
            parse_mode: 'HTML'
          });
        } catch (thumbError) {
          console.warn('Failed to send thumbnail:', thumbError.message);
        }
      }

      // Download video dengan STREAMING (tidak load semua ke memory)
      console.log(`📥 Downloading from: ${downloadLink}`);

      const videoResponse = await axios.get(downloadLink, {
        responseType: 'stream', // PENTING: Stream, bukan buffer
        timeout: 180000, // 3 menit timeout
        maxContentLength: 52428800, // Max 50MB
        maxBodyLength: 52428800
      });

      // Setup progress tracking
      const contentLength = parseInt(videoResponse.headers['content-length'] || 0);
      let downloadedBytes = 0;
      let lastUpdateTime = Date.now();
      const startTime = Date.now();
      let isUpdating = false; // Flag untuk prevent concurrent updates

      // Update progress setiap 5 detik (lebih aman dari rate limit)
      const updateInterval = 5000; // 5 detik
      let lastPercentage = 0;

      videoResponse.data.on('data', async (chunk) => {
        downloadedBytes += chunk.length;
        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdateTime;
        const percentage = contentLength > 0 ? Math.floor((downloadedBytes / contentLength) * 100) : 0;

        // Update jika:
        // 1. Sudah 5 detik ATAU
        // 2. Percentage naik 20% (misal: 0% -> 20% -> 40% -> 60% -> 80% -> 100%)
        // 3. Tidak sedang update (prevent concurrent)
        const percentageDiff = percentage - lastPercentage;
        const shouldUpdate = timeSinceLastUpdate >= updateInterval ||
          (percentageDiff >= 20 && timeSinceLastUpdate >= 3000);

        if (thumbnailMsg && shouldUpdate && !isUpdating) {
          isUpdating = true;

          const elapsed = Math.floor((now - startTime) / 1000);
          const downloadedMB = (downloadedBytes / 1048576).toFixed(1);
          const totalMB = contentLength > 0 ? (contentLength / 1048576).toFixed(1) : '?';

          // Hitung speed rata-rata
          const avgSpeed = downloadedBytes / ((now - startTime) / 1000);
          const speedKB = (avgSpeed / 1024).toFixed(0);

          // Progress bar (simple emoji)
          const progressEmoji = percentage < 25 ? '🔴' :
            percentage < 50 ? '🟠' :
              percentage < 75 ? '🟡' : '🟢';

          try {
            await this.bot.editMessageCaption(
              `🖼️ <b>Thumbnail</b>\n${escapeHtml(metadata.title)}\n\n` +
              `${progressEmoji} <b>${percentage}%</b> • ${downloadedMB}/${totalMB} MB\n` +
              `⚡ ${speedKB} KB/s • ⏱️ ${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, '0')}`,
              {
                chat_id: chatId,
                message_id: thumbnailMsg.message_id,
                parse_mode: 'HTML'
              }
            );
            lastUpdateTime = now;
            lastPercentage = percentage;
          } catch (editError) {
            // Ignore error silently
            if (editError.message && editError.message.includes('429')) {
              console.log('⏰ Rate limited, skipping update');
            }
          } finally {
            isUpdating = false;
          }
        }
      });

      // Kirim video langsung dari stream
      await this.bot.sendVideo(
        chatId,
        videoResponse.data, // Stream langsung, tidak di-buffer
        {
          caption: caption,
          parse_mode: 'HTML',
          supports_streaming: true
        },
        {
          filename: `${this.sanitizeFilename(metadata.title)}.mp4`,
          contentType: 'video/mp4'
        }
      );

      // Hapus status message
      await this.bot.deleteMessage(chatId, statusMsg.message_id);

      console.log(`✅ YouTube MP4 sent successfully: ${metadata.title}`);

    } catch (error) {
      console.error('Error processing YouTube MP4:', error);

      let errorMessage = '❌ <b>Gagal mendownload video YouTube</b>\n\n';

      if (error.response) {
        if (error.response.status === 404) {
          errorMessage += '🔍 Video tidak ditemukan atau URL tidak valid.';
        } else if (error.response.status === 403) {
          errorMessage += '🚫 Video tidak dapat didownload (mungkin privat atau dibatasi).';
        } else if (error.response.status === 429) {
          errorMessage += '⏰ Terlalu banyak request. Coba lagi nanti.';
        } else {
          errorMessage += `⚠️ Error API: ${error.response.status}`;
        }
      } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        errorMessage += '⏱️ Request timeout. Video mungkin terlalu besar atau koneksi lambat.';
      } else if (error.message.includes('ETELEGRAM')) {
        errorMessage += '📹 Video terlalu besar untuk dikirim via Telegram (max 50MB).';
      } else if (error.message.includes('maxContentLength')) {
        errorMessage += '📹 Video melebihi batas ukuran (max 50MB).';
      } else if (error.message.includes('terlalu panjang')) {
        errorMessage += error.message;
      } else {
        errorMessage += `⚠️ ${this.escapeHtml(error.message)}`;
      }

      errorMessage += '\n\n💡 <b>Tips:</b>\n';
      errorMessage += '• Pastikan link YouTube valid\n';
      errorMessage += '• Maksimal durasi 10 menit\n';
      errorMessage += '• Gunakan /ytmp3 untuk audio saja';

      // Update atau kirim error message
      if (statusMsg) {
        await this.bot.editMessageText(errorMessage, {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'HTML'
        });
      } else {
        await this.bot.sendMessage(chatId, errorMessage, { parse_mode: 'HTML' });
      }
    }
  }

  escapeHtml(text) {
    if (!text) return 'N/A';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  formatNumber(num) {
    // Handle null or undefined
    if (num === null || num === undefined) {
      return 'N/A';
    }

    // Convert to number if string
    const number = typeof num === 'string' ? parseInt(num) : num;

    if (isNaN(number)) {
      return 'N/A';
    }

    if (number >= 1000000) {
      return (number / 1000000).toFixed(1) + 'M';
    } else if (number >= 1000) {
      return (number / 1000).toFixed(1) + 'K';
    }
    return number.toString();
  }

  sanitizeFilename(filename) {
    if (!filename) return 'video';
    return filename
      .replace(/[<>:"/\\|?*]/g, '') // Hapus karakter invalid
      .replace(/\s+/g, '_') // Ganti spasi dengan underscore
      .substring(0, 100); // Batasi panjang
  }
}

module.exports = YtMp4Handler;