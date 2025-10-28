const axios = require('axios');
const FormData = require('form-data');

class HitamkanHandler {
  constructor(bot, ferdevApiKey, uploaderUrl) {
    this.bot = bot;
    this.ferdevApiKey = ferdevApiKey;
    this.uploaderUrl = uploaderUrl;
    this.waitingForImage = {};
  }

  /**
   * Register command handlers
   */
  register() {
    // Command /hitamkan
    this.bot.onText(/\/hitamkan/, async (msg) => {
      await this.handleHitamkanCommand(msg);
    });

    // Handler untuk menerima gambar (akan dipanggil dari main bot)
    console.log('✅ Hitamkan handler registered');
  }

  /**
   * Handle /hitamkan command
   */
  async handleHitamkanCommand(msg) {
    const chatId = msg.chat.id;

    // CEK 1: Apakah ini reply ke gambar
    if (msg.reply_to_message && msg.reply_to_message.photo) {
      await this.processHitamkan(chatId, msg.reply_to_message);
      return;
    }

    // CEK 2: Apakah pesan ini sendiri punya gambar (gambar dengan caption /hitamkan)
    if (msg.photo && msg.photo.length > 0) {
      await this.processHitamkan(chatId, msg);
      return;
    }

    // CEK 3: Jika tidak ada gambar, set flag menunggu
    this.waitingForImage[chatId] = true;
    this.bot.sendMessage(chatId, '📸 Silakan kirim gambar yang ingin dihitamkan sekarang!');

    // Auto-clear setelah 5 menit
    setTimeout(() => {
      if (this.waitingForImage[chatId]) {
        delete this.waitingForImage[chatId];
        this.bot.sendMessage(chatId, '⏱️ Waktu habis. Silakan ketik /hitamkan lagi jika masih ingin menghitamkan gambar.');
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Check if user is waiting for image
   */
  isWaitingForImage(chatId) {
    return this.waitingForImage[chatId] === true;
  }

  /**
   * Clear waiting status
   */
  clearWaitingStatus(chatId) {
    delete this.waitingForImage[chatId];
  }

  /**
   * Process image to black & white
   */
  async processHitamkan(chatId, msg) {
    const processingMsg = await this.bot.sendMessage(chatId, '⏳ Sedang memproses penghitaman...');

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

      const fileName = `telegram_image_${Date.now()}.jpg`;
      const uploadedUrl = await this.uploadImageToGitHub(imageBuffer, fileName);

      await this.bot.editMessageText('🎨 Menghitamkan gambar...', {
        chat_id: chatId,
        message_id: processingMsg.message_id
      });

      const bwImageBuffer = await this.convertToBlackWhite(uploadedUrl);

      await this.bot.deleteMessage(chatId, processingMsg.message_id);

      await this.bot.sendPhoto(chatId, bwImageBuffer, {
        caption: '⚫ *Gambar Berhasil Dihitamkan!*',
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

      this.bot.editMessageText(errorMessage, {
        chat_id: chatId,
        message_id: processingMsg.message_id
      });
    }
  }

  /**
   * Upload image to GitHub uploader
   */
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

  /**
   * Convert image to black & white using API
   */
  async convertToBlackWhite(imageUrl) {
    try {
      const response = await axios.get('https://api.ferdev.my.id/maker/tohitam', {
        params: {
          link: imageUrl,
          apikey: this.ferdevApiKey
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
}

module.exports = HitamkanHandler;