const axios = require('axios');

class YtShortsHandler {
  constructor(bot, apiKey) {
    this.bot = bot;
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.ferdev.my.id/downloader/ytshorts';
  }

  register() {
    // Command /ytshort
    this.bot.onText(/\/ytshort(?:\s+(.+))?/, async (msg, match) => {
      await this.handleCommand(msg, match);
    });
  }

  async handleCommand(msg, match) {
    const chatId = msg.chat.id;
    const url = match[1]?.trim();

    if (!url) {
      await this.bot.sendMessage(
        chatId,
        '❌ *Cara penggunaan:*\n\n' +
        '`/ytshort <link YouTube Shorts>`\n\n' +
        '*Contoh:*\n' +
        '`/ytshort https://youtube.com/shorts/MdEWuiIM1d0`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    await this.processYtShorts(chatId, url);
  }

  async processYtShorts(chatId, url) {
    let processingMsg;

    try {
      // Kirim pesan processing
      processingMsg = await this.bot.sendMessage(
        chatId,
        '🎬 *Memproses YouTube Shorts...*\n\nSilakan tunggu sebentar...',
        { parse_mode: 'Markdown' }
      );

      console.log(`📥 Downloading YouTube Shorts: ${url}`);

      // Request ke API
      const response = await axios.get(this.baseUrl, {
        params: {
          link: url,
          apikey: this.apiKey
        },
        timeout: 60000 // 60 detik timeout
      });

      // Cek response
      if (!response.data || !response.data.success) {
        throw new Error('Gagal mendapatkan data dari API');
      }

      const { title, download } = response.data.data;

      if (!download) {
        throw new Error('Link download tidak tersedia');
      }

      // Update pesan ke uploading
      await this.bot.editMessageText(
        '📤 *Mengupload video...*\n\nMohon tunggu sebentar...',
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: 'Markdown'
        }
      );

      // Download video dari link
      const videoResponse = await axios.get(download, {
        responseType: 'arraybuffer',
        timeout: 120000, // 2 menit timeout untuk download
        maxContentLength: 50 * 1024 * 1024, // Max 50MB
        maxBodyLength: 50 * 1024 * 1024
      });

      const videoBuffer = Buffer.from(videoResponse.data);

      // Kirim video ke user
      await this.bot.sendVideo(
        chatId,
        videoBuffer,
        {
          caption: title 
            ? `🎬 *${title}*\n\n_Downloaded by @igimonsanbot_`
            : '🎬 *YouTube Shorts Video*\n\n_Downloaded by @igimonsanbot_',
          parse_mode: 'Markdown'
        }
      );

      // Hapus pesan processing
      await this.bot.deleteMessage(chatId, processingMsg.message_id);

      console.log('✅ YouTube Shorts berhasil dikirim');

    } catch (error) {
      console.error('❌ Error downloading YouTube Shorts:', error.message);

      let errorMessage = '❌ *Gagal mendownload YouTube Shorts*\n\n';

      if (error.response) {
        if (error.response.status === 403 || error.response.status === 401) {
          errorMessage += 'API Key tidak valid atau expired.';
        } else if (error.response.status === 404) {
          errorMessage += 'Video tidak ditemukan atau link tidak valid.';
        } else {
          errorMessage += `Server error: ${error.response.status}`;
        }
      } else if (error.code === 'ECONNABORTED') {
        errorMessage += 'Request timeout. Video mungkin terlalu besar atau koneksi lambat.';
      } else if (error.message.includes('maxContentLength')) {
        errorMessage += 'Video terlalu besar untuk didownload (max 50MB).';
      } else {
        errorMessage += error.message || 'Terjadi kesalahan yang tidak diketahui.';
      }

      errorMessage += '\n\n💡 _Pastikan link YouTube Shorts valid dan coba lagi._';

      if (processingMsg) {
        await this.bot.editMessageText(errorMessage, {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: 'Markdown'
        });
      } else {
        await this.bot.sendMessage(chatId, errorMessage, { parse_mode: 'Markdown' });
      }
    }
  }
}

module.exports = YtShortsHandler;