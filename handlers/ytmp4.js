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

      // Update status
      await this.bot.editMessageText(
        '📥 Mendownload video...',
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

      // Download video
      const videoResponse = await axios.get(downloadLink, {
        responseType: 'stream',
        timeout: 300000 // 5 menit timeout untuk download
      });

      // Kirim thumbnail terlebih dahulu
      if (metadata.thumbnail) {
        try {
          await this.bot.sendPhoto(chatId, metadata.thumbnail, {
            caption: `🖼️ <b>Thumbnail</b>\n${escapeHtml(metadata.title)}\n\n<i>Video youtube sedang dikirim...</i>`,
            parse_mode: 'HTML'
          });
        } catch (thumbError) {
          console.warn('Failed to send thumbnail:', thumbError.message);
        }
      }

      // Kirim video
      await this.bot.sendVideo(
        chatId,
        videoResponse.data,
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
      } else {
        errorMessage += `⚠️ ${this.escapeHtml(error.message)}`;
      }

      errorMessage += '\n\n💡 <b>Tips:</b>\n';
      errorMessage += '• Pastikan link YouTube valid\n';
      errorMessage += '• Coba link yang lebih pendek (&lt; 10 menit)\n';
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