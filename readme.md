# Telegram Bot - Modular Structure

## 📁 Struktur Folder

```
project/
├── index.js                    # Main bot entry point
├── tiktokdownloader.js         # TikTok downloader class
├── .env                        # Environment variables
├── package.json                # Dependencies
│
├── handlers/                   # Handler untuk menerima perintah bot
│   ├── tiktokHandler.js       # Handler untuk command TikTok
│   ├── instagramHandler.js    # Handler untuk command Instagram
│   ├── imageHandler.js        # Handler untuk command image processing
│   └── helpHandler.js         # Handler untuk command help/start
│
├── services/                   # Service layer untuk API calls
│   ├── instagramService.js    # Service untuk Instagram API
│   └── imageService.js        # Service untuk image processing API
│
└── utils/                      # Utility functions
    └── formatters.js          # Helper untuk formatting data
```

## 🔄 Alur Kerja

### 1. **index.js** (Main Entry Point)
- Inisialisasi bot
- Register semua command handlers
- Routing perintah ke handler yang sesuai
- Error handling global

### 2. **handlers/** (Command Handlers)
- Menerima pesan dari user
- Validasi input
- Memanggil service yang diperlukan
- Mengirim response ke user
- Handle error spesifik per command

### 3. **services/** (Business Logic)
- Komunikasi dengan external APIs
- Download dan process media
- Transform data
- Reusable business logic

### 4. **utils/** (Utilities)
- Helper functions
- Formatters
- Shared utilities

## 📋 Deskripsi File

### **index.js**
Main file yang mengatur routing command bot. Hanya berisi:
- Inisialisasi bot
- Registrasi command (`bot.onText()`)
- Routing ke handler
- Global error handling

### **handlers/tiktokHandler.js**
Handler untuk semua command TikTok:
- `/tiktok <url>` - Download TikTok
- `/t <url>` - Shortcut TikTok
- Handle carousel dan video
- Validasi URL
- Error handling spesifik TikTok

### **handlers/instagramHandler.js**
Handler untuk command Instagram:
- `/ig <url>` - Download Instagram
- Determine content type (video/image/carousel)
- Route ke function yang sesuai
- Error handling spesifik Instagram

### **handlers/imageHandler.js**
Handler untuk image processing:
- `/hitamkan` - Convert to black & white
- `/remini` - Enhance image quality
- Handle waiting state
- Download dari Telegram
- Error handling spesifik image processing

### **handlers/helpHandler.js**
Handler untuk help menu:
- `/start` - Show help message
- Display available commands

### **services/instagramService.js**
Service untuk Instagram operations:
- Fetch content dari API
- Determine content type
- Download video/image/carousel
- Convert image formats
- Reusable Instagram logic

### **services/imageService.js**
Service untuk image processing:
- Upload image ke GitHub
- Convert to black & white (API)
- Enhance with Remini (API)
- Convert image formats

### **utils/formatters.js**
Utility untuk formatting:
- Format numbers (1K, 1M, etc)
- Format stats untuk TikTok

## 🚀 Cara Menggunakan

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment Variables
Buat file `.env`:
```env
BOT_TOKEN=your_telegram_bot_token
FERDEV_API_KEY=your_ferdev_api_key
UPLOADER_URL=your_uploader_url
```

### 3. Buat Folder Structure
```bash
mkdir handlers services utils
```

### 4. Copy Files
Copy semua file sesuai struktur folder di atas.

### 5. Run Bot
```bash
node index.js
```

## ✨ Keuntungan Struktur Modular

### ✅ Separation of Concerns
- **Handler**: Fokus pada interaksi dengan user
- **Service**: Fokus pada business logic & API calls
- **Utils**: Reusable functions

### ✅ Mudah di-Maintain
- Setiap file punya tanggung jawab jelas
- Mudah menemukan bug
- Mudah menambah fitur baru

### ✅ Reusable Code
- Service bisa dipakai di handler lain
- Utilities bisa dipakai di mana saja
- Tidak ada code duplication

### ✅ Scalable
- Mudah menambah handler baru
- Mudah menambah service baru
- Mudah testing per module

### ✅ Clean Code
- File lebih pendek dan readable
- Logic terpisah dengan jelas
- Mudah dipahami developer lain

## 📝 Contoh Menambah Fitur Baru

### Menambah Command YouTube Downloader

1. **Buat Handler** (`handlers/youtubeHandler.js`):
```javascript
const youtubeService = require('../services/youtubeService');

async function handleYouTube(bot, msg, match) {
  const chatId = msg.chat.id;
  const url = match[1].trim();
  
  // Validasi & process
  const video = await youtubeService.downloadVideo(url);
  
  // Send to user
  await bot.sendVideo(chatId, video);
}

module.exports = { handleYouTube };
```

2. **Buat Service** (`services/youtubeService.js`):
```javascript
const axios = require('axios');

async function downloadVideo(url) {
  // Download logic
  return videoBuffer;
}

module.exports = { downloadVideo };
```

3. **Register di index.js**:
```javascript
const youtubeHandler = require('./handlers/youtubeHandler');

bot.onText(/\/youtube\s+(.+)/, (msg, match) => 
  youtubeHandler.handleYouTube(bot, msg, match)
);
```

## 🔍 Tips Development

1. **Selalu handle error di setiap layer**
2. **Gunakan console.log untuk tracking**
3. **Validate input di handler**
4. **Keep service pure (no bot dependencies)**
5. **Reuse utilities sebanyak mungkin**

## 📚 Dependencies

```json
{
  "node-telegram-bot-api": "^0.64.0",
  "axios": "^1.6.0",
  "sharp": "^0.33.0",
  "form-data": "^4.0.0",
  "dotenv": "^16.0.0"
}
```

## 🐛 Debugging

Untuk debugging, tambahkan log di setiap layer:

```javascript
// Handler
console.log('📨 Received command:', msg.text);

// Service
console.log('🔄 Processing:', url);

// Error
console.error('❌ Error:', error.message);
```

## 📞 Support

Jika ada pertanyaan atau butuh bantuan, silakan buka issue di repository.