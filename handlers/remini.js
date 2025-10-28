const axios = require('axios');
const FormData = require('form-data');

class ReminiHandler {
  constructor(bot, apiKey, uploaderUrl) {
    this.bot = bot;
    this.apiKey = apiKey;
    this.uploaderUrl = uploaderUrl;
    this.waitingForRemini = {};
  }

  // Register semua handler untuk Remini
  register() {
    // Command /remini
    this.bot.onText(/\/remini/, async (msg) => {
      await this.handleReminiCommand(msg);
    });

    console.log('✅ Remini handler registered');
  }

  // Handle command /remini
  async handleReminiCommand(msg) {
    const chatId = msg.chat.id;

    // CEK 1: Apakah ini reply ke gambar
    if (msg.reply_to_message && msg.reply_to_message.photo) {
      await this.processRemini(chatId, msg.reply_to_message);
      return;
    }

    // CEK 2: Apakah pesan ini sendiri punya gambar (gambar dengan caption /remini)
    if (msg.photo && msg.photo.length > 0) {
      await this.processRemini(chatId, msg);
      return;
    }

    // CEK 3: Jika tidak ada gambar, set flag menunggu
    this.waitingForRemini[chatId] = true;
    this.bot.sendMessage(chatId, '✨ Silakan kirim gambar yang ingin ditingkatkan kualitasnya sekarang!\n\n_Remini AI akan meningkatkan resolusi dan detail gambar Anda_', {
      parse_mode: 'Markdown'
    });

    // Auto-clear setelah 5 menit
    setTimeout(() => {
      if (this.waitingForRemini[chatId]) {
        delete this.waitingForRemini[chatId];
        this.bot.sendMessage(chatId, '⏱️ Waktu habis. Silakan ketik /remini lagi jika masih ingin meningkatkan kualitas gambar.');
      }
    }, 5 * 60 * 1000);
  }

  // Proses gambar dengan Remini
  async processRemini(chatId, msg) {
    const processingMsg = await this.bot.sendMessage(chatId, '⏳ Sedang memproses peningkatan kualitas gambar...');

    try {
      const photo = msg.photo[msg.photo.length - 1];
      const fileId = photo.file_id;

      await this.bot.editMessageText('📥 Mengunduh gambar...', {
        chat_id: chatId,
        message_id: processingMsg.message_id
      });

      const fileLink = await this.bot.getFileLink(fileId);
      const imageResponse = await axios.get(fileLink, {
        responseType: 'arraybuffer',
        timeout: 30000
      });

      const imageBuffer = Buffer.from(imageResponse.data);

      await this.bot.editMessageText('☁️ Mengupload gambar...', {
        chat_id: chatId,
        message_id: processingMsg.message_id
      });

      const fileName = `telegram_remini_${Date.now()}.jpg`;
      const uploadedUrl = await this.uploadImageToGitHub(imageBuffer, fileName);

      await this.bot.editMessageText('✨ Meningkatkan kualitas gambar...\n_Proses ini mungkin memakan waktu 30-60 detik_', {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: 'Markdown'
      });

      const enhancedImageUrl = await this.enhanceImageWithRemini(uploadedUrl);

      await this.bot.editMessageText('📥 Mengunduh hasil...', {
        chat_id: chatId,
        message_id: processingMsg.message_id
      });

      const enhancedResponse = await axios.get(enhancedImageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000
      });

      const enhancedBuffer = Buffer.from(enhancedResponse.data);

      await this.bot.deleteMessage(chatId, processingMsg.message_id);

      await this.bot.sendPhoto(chatId, enhancedBuffer, {
        caption: '✨ *Gambar Berhasil Ditingkatkan Kualitasnya!*\n\n_Powered by Remini AI_',
        parse_mode: 'Markdown'
      });

      console.log('✅ Remini process completed successfully');

    } catch (error) {
      console.error('Error processing remini:', error);

      let errorMessage = '❌ Terjadi kesalahan saat memproses gambar';

      if (error.message.includes('upload')) {
        errorMessage = '❌ Gagal mengupload gambar ke server. Silakan coba lagi.';
      } else if (error.message.includes('Remini')) {
        errorMessage = '❌ Gagal meningkatkan kualitas gambar. Silakan coba lagi.';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = '❌ Timeout: Proses terlalu lama. Coba dengan gambar yang lebih kecil.';
      } else if (error.response?.status === 429) {
        errorMessage = '❌ Terlalu banyak request. Tunggu beberapa menit lalu coba lagi.';
      }

      this.bot.editMessageText(errorMessage, {
        chat_id: chatId,
        message_id: processingMsg.message_id
      });
    }
  }

  // Upload gambar ke GitHub uploader
  async uploadImageToGitHub(imageBuffer, fileName) {
    try {
      const formData = new FormData();
      formData.append('file', imageBuffer, fileName);

      const response = await axios.post(`${this.uploaderUrl}/upload`, formData, {
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

  // Enhance gambar menggunakan Remini API
  async enhanceImageWithRemini(imageUrl) {
    try {
      const response = await axios.get('https://api.ferdev.my.id/tools/remini', {
        params: {
          link: imageUrl,
          apikey: this.apiKey
        },
        timeout: 90000
      });

      if (response.data && response.data.success && response.data.data) {
        console.log('✅ Image enhanced with Remini successfully');
        return response.data.data;
      } else {
        throw new Error('Invalid response from Remini API');
      }
    } catch (error) {
      console.error('Error enhancing with Remini:', error.message);
      throw error;
    }
  }

  // Check apakah user sedang menunggu untuk mengirim gambar Remini
  isWaitingForImage(chatId) {
    return this.waitingForRemini[chatId] === true;
  }

  // Clear waiting status
  clearWaitingStatus(chatId) {
    delete this.waitingForRemini[chatId];
  }
}

module.exports = ReminiHandler;