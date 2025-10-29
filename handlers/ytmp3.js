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
        '❌ *Format salah!*\n\n' +
        '✅ Gunakan: `/ytmp3 <link YouTube>`\n\n' +
        '*Contoh:*\n' +
        '`/ytmp3 https://youtu.be/xxxxx`\n' +
        '`/ytmp3 https://www.youtube.com/watch?v=xxxxx`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Validasi apakah link YouTube
    if (!this.isValidYouTubeUrl(url)) {
      await this.bot.sendMessage(
        chatId,
        '❌ *Link tidak valid!*\n\n' +
        'Pastikan Anda mengirim link YouTube yang benar.\n\n' +
        '*Contoh link yang valid:*\n' +
        '• `https://youtu.be/xxxxx`\n' +
        '• `https://www.youtube.com/watch?v=xxxxx`\n' +
        '• `https://m.youtube.com/watch?v=xxxxx`',
        { parse_mode: 'Markdown' }
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
    const processingMsg = await this.bot.sendMessage(
      chatId,
      '⏳ *Memproses audio...*\n\nMohon tunggu sebentar...',
      { parse_mode: 'Markdown' }
    );

    try {
      console.log(`🎵 Downloading YouTube MP3: ${url}`);

      // Request ke API dengan parameter 'link' dan 'apikey'
      const response = await axios.get(this.apiEndpoint, {
        params: {
          link: url,
          apikey: this.apiKey
        },
        timeout: 120000 // 2 menit timeout
      });

      const data = response.data;

      if (!data.success || !data.data) {
        throw new Error('Gagal mendapatkan data dari API');
      }

      const audioData = data.data;

      // Konversi size ke MB
      const sizeInMB = (audioData.size / (1024 * 1024)).toFixed(2);

      // Konversi durasi ke menit:detik
      const minutes = Math.floor(audioData.duration / 60);
      const seconds = Math.floor(audioData.duration % 60);
      const formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      // Update pesan processing
      await this.bot.editMessageText(
        '📥 *Mengunduh audio...*\n\nMohon tunggu, file sedang diunduh...',
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: 'Markdown'
        }
      );

      // Download audio dari dlink
      const audioResponse = await axios.get(audioData.dlink, {
        responseType: 'arraybuffer',
        timeout: 180000, // 3 menit timeout untuk download
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      // Hapus pesan processing
      await this.bot.deleteMessage(chatId, processingMsg.message_id);

      // Kirim info audio dengan thumbnail
      const caption = 
        `🎵 *${audioData.title}*\n\n` +
        `⏱ Durasi: ${formattedDuration}\n` +
        `📦 Ukuran: ${sizeInMB} MB\n\n` +
        `_Audio sedang dalam proses..._`;

      // Kirim thumbnail dengan caption
      if (audioData.thumbnail) {
        try {
          await this.bot.sendPhoto(chatId, audioData.thumbnail, {
            caption: caption,
            parse_mode: 'Markdown'
          });
        } catch (thumbError) {
          console.error('Error sending thumbnail:', thumbError.message);
          // Kirim caption saja jika thumbnail gagal
          await this.bot.sendMessage(chatId, caption, { parse_mode: 'Markdown' });
        }
      }

      // Kirim audio file
      await this.bot.sendAudio(chatId, Buffer.from(audioResponse.data), {
        title: audioData.title,
        performer: 'YouTube',
        thumb: audioData.thumbnail ? audioData.thumbnail : undefined
      }, {
        filename: `${audioData.title}.mp3`,
        contentType: 'audio/mpeg'
      });

      console.log(`✅ YouTube MP3 sent successfully: ${audioData.title}`);

    } catch (error) {
      console.error('Error downloading YouTube MP3:', error.message);

      let errorMessage = '❌ *Gagal mengunduh audio!*\n\n';

      if (error.response) {
        if (error.response.status === 404) {
          errorMessage += 'Video tidak ditemukan atau tidak tersedia.';
        } else if (error.response.status === 403) {
          errorMessage += 'Akses ditolak. Video mungkin dibatasi.';
        } else if (error.response.status === 400) {
          errorMessage += 'Link YouTube tidak valid atau video tidak dapat diproses.';
        } else {
          errorMessage += `Server error: ${error.response.status}`;
        }
      } else if (error.code === 'ECONNABORTED') {
        errorMessage += 'Koneksi timeout. Coba lagi nanti.';
      } else if (error.message.includes('Invalid')) {
        errorMessage += 'Link YouTube tidak valid.';
      } else {
        errorMessage += 'Terjadi kesalahan saat memproses permintaan.';
      }

      errorMessage += '\n\n_Silakan coba lagi atau gunakan link YouTube yang lain._';

      await this.bot.editMessageText(errorMessage, {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: 'Markdown'
      }).catch(() => {
        // Jika edit gagal, kirim pesan baru
        this.bot.sendMessage(chatId, errorMessage, { parse_mode: 'Markdown' });
      });
    }
  }
}

module.exports = YtMp3Handler;