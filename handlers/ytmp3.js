const axios = require('axios');

class YtMp3Handler {
  constructor(bot, apiKey) {
    this.bot = bot;
    this.apiKey = apiKey;
    this.apiEndpoint = 'https://api.ferdev.my.id/downloader/ytmp3';
  }

  register() {
    // Command /ytmp3 <link>
    this.bot.onText(/\/ytmp3(?:\s+(.+))?/, (msg, match) => {
      this.handleCommand(msg, match);
    });
  }

  async handleCommand(msg, match) {
    const chatId = msg.chat.id;
    const url = match[1]?.trim();

    if (!url) {
      await this.bot.sendMessage(
        chatId,
        '❌ <b>Cara penggunaan:</b>\n\n' +
        '<code>/ytmp3 &lt;link_youtube&gt;</code>\n\n' +
        '<b>Contoh:</b>\n' +
        '<code>/ytmp3 https://youtu.be/xxxxx</code>\n' +
        '<code>/ytmp3 https://youtube.com/watch?v=xxxxx</code>',
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Validasi apakah link YouTube
    if (!this.isValidYouTubeUrl(url)) {
      await this.bot.sendMessage(
        chatId,
        '❌ <b>Link tidak valid!</b>\n\n' +
        'Pastikan Anda mengirim link YouTube yang benar.\n\n' +
        '<b>Contoh link yang valid:</b>\n' +
        '• <code>https://youtu.be/xxxxx</code>\n' +
        '• <code>https://youtube.com/watch?v=xxxxx</code>\n' +
        '• <code>https://m.youtube.com/watch?v=xxxxx</code>',
        { parse_mode: 'HTML' }
      );
      return;
    }

    await this.processYtMp3(chatId, url);
  }

  isValidYouTubeUrl(url) {
    const youtubeRegex = /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/|v\/)|youtu\.be\/)[\w-]+/i;
    return youtubeRegex.test(url);
  }

  async processYtMp3(chatId, url) {
    let statusMsg;

    try {
      // Kirim status processing
      statusMsg = await this.bot.sendMessage(
        chatId,
        '⏳ Memproses audio YouTube...'
      );

      console.log(`🎵 Processing YouTube MP3: ${url}`);

      // Request ke API dengan parameter 'link' dan 'apikey'
      const response = await axios.get(this.apiEndpoint, {
        params: {
          link: url,
          apikey: this.apiKey
        },
        timeout: 60000 // 1 menit timeout
      });

      const data = response.data;

      if (!data.success || !data.data) {
        throw new Error('Invalid API response');
      }

      const audioData = data.data;
      const downloadLink = audioData.dlink;

      if (!downloadLink) {
        throw new Error('Download link tidak tersedia');
      }

      // Cek durasi audio - tolak jika terlalu panjang
      const durationInSeconds = audioData.duration || 0;
      const MAX_DURATION = 1200; // 20 menit (1200 detik)

      if (durationInSeconds > MAX_DURATION) {
        const minutes = Math.floor(durationInSeconds / 60);
        throw new Error(
          `Audio terlalu panjang (${minutes} menit). ` +
          `Maksimal 20 menit untuk menghemat resource server.`
        );
      }

      // Format durasi
      const minutes = Math.floor(audioData.duration / 60);
      const seconds = Math.floor(audioData.duration % 60);
      const formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      // Format size
      const sizeInMB = (audioData.size / (1024 * 1024)).toFixed(1);

      // Update status
      await this.bot.editMessageText(
        '📥 Mendownload audio...\n' +
        `⏱️ Durasi: ${formattedDuration}`,
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

      // Kirim thumbnail terlebih dahulu dengan progress tracker
      let thumbnailMsg;
      if (audioData.thumbnail) {
        try {
          thumbnailMsg = await this.bot.sendPhoto(chatId, audioData.thumbnail, {
            caption: `🎵 <b>${escapeHtml(audioData.title)}</b>\n\n<i>Memulai download...</i>`,
            parse_mode: 'HTML'
          });
        } catch (thumbError) {
          console.warn('Failed to send thumbnail:', thumbError.message);
        }
      }

      // Download audio dengan STREAMING
      console.log(`📥 Downloading from: ${downloadLink}`);

      const audioResponse = await axios.get(downloadLink, {
        responseType: 'stream',
        timeout: 180000, // 3 menit timeout
        maxContentLength: 52428800, // Max 50MB
        maxBodyLength: 52428800
      });

      // Setup progress tracking
      const contentLength = parseInt(audioResponse.headers['content-length'] || 0);
      let downloadedBytes = 0;
      let lastUpdateTime = Date.now();
      const startTime = Date.now();
      let isUpdating = false;

      const updateInterval = 5000; // 5 detik
      let lastPercentage = 0;

      audioResponse.data.on('data', async (chunk) => {
        downloadedBytes += chunk.length;
        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdateTime;
        const percentage = contentLength > 0 ? Math.floor((downloadedBytes / contentLength) * 100) : 0;

        const percentageDiff = percentage - lastPercentage;
        const shouldUpdate = timeSinceLastUpdate >= updateInterval ||
          (percentageDiff >= 20 && timeSinceLastUpdate >= 3000);

        if (thumbnailMsg && shouldUpdate && !isUpdating) {
          isUpdating = true;

          const elapsed = Math.floor((now - startTime) / 1000);
          const downloadedMB = (downloadedBytes / 1048576).toFixed(1);
          const totalMB = contentLength > 0 ? (contentLength / 1048576).toFixed(1) : '?';

          const avgSpeed = downloadedBytes / ((now - startTime) / 1000);
          const speedKB = (avgSpeed / 1024).toFixed(0);

          const progressEmoji = percentage < 25 ? '🔴' :
            percentage < 50 ? '🟠' :
              percentage < 75 ? '🟡' : '🟢';

          try {
            await this.bot.editMessageCaption(
              `🎵 <b>${escapeHtml(audioData.title)}</b>\n\n` +
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
            if (editError.message && editError.message.includes('429')) {
              console.log('⏰ Rate limited, skipping update');
            }
          } finally {
            isUpdating = false;
          }
        }
      });

      // Format caption untuk audio
      const audioCaption =
        `🎵 <b>${escapeHtml(audioData.title)}</b>\n\n` +
        `⏱️ <b>Duration:</b> ${formattedDuration}\n` +
        `📦 <b>Size:</b> ${sizeInMB} MB\n\n` +
        `<i>Downloaded by @igimonsanbot</i>`;

      // Kirim audio
      await this.bot.sendAudio(
        chatId,
        audioResponse.data,
        {
          caption: audioCaption,
          parse_mode: 'HTML',
          title: audioData.title,
          performer: 'YouTube'
        },
        {
          filename: `${this.sanitizeFilename(audioData.title)}.mp3`,
          contentType: 'audio/mpeg'
        }
      );

      // Hapus status message
      await this.bot.deleteMessage(chatId, statusMsg.message_id);

      console.log(`✅ YouTube MP3 sent successfully: ${audioData.title}`);

    } catch (error) {
      console.error('Error processing YouTube MP3:', error);

      let errorMessage = '❌ <b>Gagal mendownload audio YouTube</b>\n\n';

      if (error.response) {
        if (error.response.status === 404) {
          errorMessage += '🔍 Audio tidak ditemukan atau URL tidak valid.';
        } else if (error.response.status === 403) {
          errorMessage += '🚫 Audio tidak dapat didownload (mungkin privat atau dibatasi).';
        } else if (error.response.status === 429) {
          errorMessage += '⏰ Terlalu banyak request. Coba lagi nanti.';
        } else {
          errorMessage += `⚠️ Error API: ${error.response.status}`;
        }
      } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        errorMessage += '⏱️ Request timeout. Audio mungkin terlalu besar atau koneksi lambat.';
      } else if (error.message.includes('ETELEGRAM')) {
        errorMessage += '🎵 Audio terlalu besar untuk dikirim via Telegram (max 50MB).';
      } else if (error.message.includes('maxContentLength')) {
        errorMessage += '🎵 Audio melebihi batas ukuran (max 50MB).';
      } else if (error.message.includes('terlalu panjang')) {
        errorMessage += error.message;
      } else {
        errorMessage += `⚠️ ${this.escapeHtml(error.message)}`;
      }

      errorMessage += '\n\n💡 <b>Tips:</b>\n';
      errorMessage += '• Pastikan link YouTube valid\n';
      errorMessage += '• Maksimal durasi 20 menit\n';
      errorMessage += '• Gunakan /ytmp4 untuk video penuh';

      // Update atau kirim error message
      if (statusMsg) {
        await this.bot.editMessageText(errorMessage, {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'HTML'
        }).catch(() => {
          this.bot.sendMessage(chatId, errorMessage, { parse_mode: 'HTML' });
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

  sanitizeFilename(filename) {
    if (!filename) return 'audio';
    return filename
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100);
  }
}

module.exports = YtMp3Handler;