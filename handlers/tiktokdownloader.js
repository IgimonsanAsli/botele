const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const path = require('path');

class TikTokDownloader {
    constructor(bot) {
        this.bot = bot;
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br'
        };
    }

    // Register command handlers
    register() {
        this.bot.onText(/\/(tiktok|t)\s+(.+)/, (msg, match) => this.handleCommand(msg, match));
    }

    // Handler untuk command /tiktok atau /t
    async handleCommand(msg, match) {
        const chatId = msg.chat.id;
        const url = match[2].trim();

        if (!url) {
            this.bot.sendMessage(chatId, '❌ Mohon masukkan URL TikTok!\n\nContoh:\n/tiktok https://vt.tiktok.com/xxxxx\n/t https://www.tiktok.com/@user/video/xxxxx\n/t https://vm.tiktok.com/xxxxx');
            return;
        }

        // Validasi apakah URL mengandung domain TikTok
        if (!url.match(/tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com/i)) {
            this.bot.sendMessage(chatId, '❌ URL tidak valid! Pastikan ini adalah link TikTok yang benar.');
            return;
        }

        await this.processTikTok(chatId, url);
    }

    // Method utama untuk memproses TikTok
    async processTikTok(chatId, url) {
        const processingMsg = await this.bot.sendMessage(chatId, '⏳ Sedang memproses konten TikTok...');

        try {
            // Gunakan method downloadContent untuk mendapatkan info konten
            const contentInfo = await this.downloadContent(url);

            if (!contentInfo.success) {
                await this.bot.editMessageText(
                    `❌ ${contentInfo.error || 'Gagal mengunduh konten TikTok'}\n\nPastikan:\n• Link masih aktif\n• Video tidak di-private\n• Format URL benar`,
                    {
                        chat_id: chatId,
                        message_id: processingMsg.message_id
                    }
                );
                return;
            }

            // Hapus pesan processing
            await this.bot.deleteMessage(chatId, processingMsg.message_id);

            // Handle berdasarkan tipe konten
            if (contentInfo.type === 'carousel') {
                await this.sendCarousel(chatId, contentInfo);
            } else {
                await this.sendVideo(chatId, contentInfo);
            }

        } catch (error) {
            console.error('Error TikTok:', error);

            let errorMessage = '❌ Terjadi kesalahan saat memproses TikTok';

            if (error.code === 'ECONNABORTED') {
                errorMessage = '❌ Timeout: Video terlalu besar atau koneksi lambat. Coba lagi.';
            } else if (error.response?.status === 404) {
                errorMessage = '❌ Video tidak ditemukan. Link mungkin salah atau video sudah dihapus.';
            } else if (error.response?.status === 403) {
                errorMessage = '❌ Akses ditolak. Video mungkin di-private atau dibatasi.';
            } else if (error.message?.includes('Invalid')) {
                errorMessage = '❌ Format URL tidak valid. Pastikan menggunakan link TikTok yang benar.';
            }

            this.bot.editMessageText(errorMessage, {
                chat_id: chatId,
                message_id: processingMsg.message_id
            }).catch(() => {
                this.bot.sendMessage(chatId, errorMessage);
            });
        }
    }

    // Method untuk mengirim carousel
    async sendCarousel(chatId, contentInfo) {
        try {
            // Kirim info carousel
            await this.bot.sendMessage(
                chatId,
                `🖼️ *TikTok Carousel*\n\n👤 Author: ${contentInfo.author.nickname} (@${contentInfo.author.username})\n📝 ${contentInfo.title}\n🎵 Music: ${contentInfo.music.title} - ${contentInfo.music.author}\n\n📊 ${this.formatStats(contentInfo.stats)}\n\n⬇️ Mengunduh ${contentInfo.images.length} gambar...`,
                { parse_mode: 'Markdown' }
            );

            // Kirim semua gambar satu per satu
            for (let i = 0; i < contentInfo.images.length; i++) {
                const image = contentInfo.images[i];

                try {
                    await this.bot.sendPhoto(chatId, image.url, {
                        caption: `🖼️ Gambar ${i + 1}/${contentInfo.images.length}`
                    });

                    // Delay untuk menghindari rate limit
                    if (i < contentInfo.images.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (error) {
                    console.error(`Error sending image ${i + 1}:`, error.message);
                }
            }

            // Kirim musik jika tersedia
            if (contentInfo.music && contentInfo.music.url) {
                try {
                    await this.bot.sendMessage(chatId, '🎵 Sedang mengunduh musik...');
                    await this.bot.sendAudio(chatId, contentInfo.music.url, {
                        title: contentInfo.music.title,
                        performer: contentInfo.music.author,
                        caption: `🎵 ${contentInfo.music.title} - ${contentInfo.music.author}`
                    });
                } catch (error) {
                    console.error('Error sending music:', error.message);
                    await this.bot.sendMessage(chatId, '⚠️ Musik tidak dapat diunduh');
                }
            }

            console.log('✅ TikTok carousel sent successfully');
        } catch (error) {
            console.error('Error sending carousel:', error);
            throw error;
        }
    }

    // Method untuk mengirim video
    async sendVideo(chatId, contentInfo) {
        try {
            const videoUrl = contentInfo.video.noWatermark || contentInfo.video.watermark;

            if (!videoUrl) {
                await this.bot.sendMessage(chatId, '❌ URL video tidak ditemukan');
                return;
            }

            const hasWatermark = !contentInfo.video.noWatermark;
            const watermarkText = hasWatermark ? '⚠️ _Video dengan watermark_' : '✅ _Video tanpa watermark_';

            await this.bot.sendMessage(chatId, '⬇️ Sedang mengunduh video...');

            try {
                // Download video dengan axios
                const videoResponse = await axios.get(videoUrl, {
                    responseType: 'arraybuffer',
                    timeout: 120000, // 2 menit timeout
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': '*/*'
                    }
                });

                const videoBuffer = Buffer.from(videoResponse.data);

                // Kirim video
                await this.bot.sendVideo(chatId, videoBuffer, {
                    caption: `🎵 *TikTok Video*\n\n👤 Author: ${contentInfo.author.nickname} (@${contentInfo.author.username})\n📝 ${contentInfo.title}\n🎵 Music: ${contentInfo.music.title} - ${contentInfo.music.author}\n⏱️ Duration: ${contentInfo.video.duration}s\n\n📊 ${this.formatStats(contentInfo.stats)}\n\n${watermarkText}`,
                    parse_mode: 'Markdown',
                    supports_streaming: true
                });

                console.log('✅ TikTok video sent successfully');

            } catch (videoError) {
                console.error('Error downloading video:', videoError);

                // Fallback: kirim sebagai URL jika download gagal
                await this.bot.sendMessage(
                    chatId,
                    `🎵 *TikTok Video*\n\n👤 Author: ${contentInfo.author.nickname} (@${contentInfo.author.username})\n📝 ${contentInfo.title}\n🎵 Music: ${contentInfo.music.title} - ${contentInfo.music.author}\n⏱️ Duration: ${contentInfo.video.duration}s\n\n📊 ${this.formatStats(contentInfo.stats)}\n\n${watermarkText}\n\n🔗 [Download Video](${videoUrl})`,
                    {
                        parse_mode: 'Markdown',
                        disable_web_page_preview: false
                    }
                );
            }
        } catch (error) {
            console.error('Error sending video:', error);
            throw error;
        }
    }

    // Helper untuk format stats
    formatStats(stats) {
        if (!stats) return '';

        const formatNumber = (num) => {
            if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
            if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
            return num.toString();
        };

        return `👁️ ${formatNumber(stats.views)} • ❤️ ${formatNumber(stats.likes)} • 💬 ${formatNumber(stats.comments)} • 🔄 ${formatNumber(stats.shares)}`;
    }

    // Method untuk mengekstrak video ID dari URL
    extractVideoId(url) {
        try {
            const regex = /(?:https?:\/\/)?(?:www\.)?(?:tiktok\.com\/@[\w.-]+\/video\/|vm\.tiktok\.com\/|tiktok\.com\/t\/)(\w+)/;
            const match = url.match(regex);
            return match ? match[1] : null;
        } catch (error) {
            console.error('Error extracting video ID:', error);
            return null;
        }
    }

    // Method untuk mendapatkan URL asli dari shortlink
    async getOriginalUrl(shortUrl) {
        try {
            const response = await axios.get(shortUrl, {
                headers: this.headers,
                maxRedirects: 5,
                timeout: 10000
            });
            return response.request.res.responseUrl || shortUrl;
        } catch (error) {
            console.error('Error getting original URL:', error);
            return shortUrl;
        }
    }

    // Method utama untuk download konten TikTok (video atau carousel)
    async downloadContent(url) {
        try {
            // Jika URL pendek, dapatkan URL asli
            if (url.includes('vm.tiktok.com') || url.includes('/t/')) {
                url = await this.getOriginalUrl(url);
            }

            console.log('Processing URL:', url);

            // Gunakan tikwm API
            const result = await this.downloadWithTikwm(url);

            if (result.success) {
                return result;
            }

            // Fallback ke API alternatif
            return await this.fallbackDownload(url);

        } catch (error) {
            console.error('Error downloading content:', error);
            return {
                success: false,
                error: 'Gagal mendownload konten. Coba lagi nanti.'
            };
        }
    }

    // Method untuk download menggunakan tikwm API
    async downloadWithTikwm(url) {
        try {
            const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;

            const response = await axios.get(apiUrl, {
                headers: this.headers,
                timeout: 15000
            });

            console.log('TikWM API Response:', JSON.stringify(response.data, null, 2));

            if (response.data && response.data.code === 0) {
                const data = response.data.data;

                // Cek apakah ini carousel (image slideshow)
                if (data.images && data.images.length > 0) {
                    return {
                        success: true,
                        type: 'carousel',
                        title: data.title || 'TikTok Carousel',
                        author: {
                            username: data.author.unique_id || 'unknown',
                            nickname: data.author.nickname || 'Unknown',
                            avatar: data.author.avatar || null
                        },
                        music: {
                            title: data.music_info?.title || 'Unknown Music',
                            author: data.music_info?.author || 'Unknown Artist',
                            url: data.music || data.music_info?.play || null,
                            duration: data.duration || 0
                        },
                        images: data.images.map((img, index) => ({
                            index: index + 1,
                            url: img
                        })),
                        stats: {
                            views: data.play_count || 0,
                            likes: data.digg_count || 0,
                            comments: data.comment_count || 0,
                            shares: data.share_count || 0
                        },
                        create_time: data.create_time || null
                    };
                }
                // Video biasa
                else if (data.play) {
                    return {
                        success: true,
                        type: 'video',
                        title: data.title || 'TikTok Video',
                        author: {
                            username: data.author.unique_id || 'unknown',
                            nickname: data.author.nickname || 'Unknown',
                            avatar: data.author.avatar || null
                        },
                        video: {
                            noWatermark: data.play || null,
                            watermark: data.wmplay || null,
                            duration: data.duration || 0
                        },
                        music: {
                            title: data.music_info?.title || 'Unknown Music',
                            author: data.music_info?.author || 'Unknown Artist',
                            url: data.music || data.music_info?.play || null,
                            duration: data.duration || 0
                        },
                        stats: {
                            views: data.play_count || 0,
                            likes: data.digg_count || 0,
                            comments: data.comment_count || 0,
                            shares: data.share_count || 0
                        },
                        create_time: data.create_time || null
                    };
                }
            }

            throw new Error('Invalid response from TikWM API');

        } catch (error) {
            console.error('TikWM API failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Method fallback untuk download
    async fallbackDownload(url) {
        try {
            const apiUrl = `https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`;

            const response = await axios.get(apiUrl, {
                headers: this.headers,
                timeout: 15000
            });

            if (response.data && response.data.video) {
                return {
                    success: true,
                    type: 'video',
                    title: response.data.title || 'TikTok Video',
                    author: {
                        username: response.data.author || 'unknown',
                        nickname: response.data.author || 'Unknown',
                        avatar: null
                    },
                    video: {
                        noWatermark: response.data.video.noWatermark,
                        watermark: response.data.video.watermark,
                        duration: 0
                    },
                    music: {
                        title: 'Unknown Music',
                        author: 'Unknown Artist',
                        url: response.data.music || null,
                        duration: 0
                    },
                    stats: {
                        views: 0,
                        likes: 0,
                        comments: 0,
                        shares: 0
                    },
                    create_time: null
                };
            }

            throw new Error('Fallback API failed');

        } catch (error) {
            console.error('Fallback download failed:', error);
            return {
                success: false,
                error: 'Gagal mendownload konten dari semua API yang tersedia.'
            };
        }
    }

    // Method untuk download file (video, gambar, atau audio)
    async downloadFile(fileUrl, fileName, category, subfolder = '') {
        try {
            const response = await axios({
                method: 'GET',
                url: fileUrl,
                responseType: 'stream',
                headers: this.headers,
                timeout: 60000
            });

            // Buat folder berdasarkan kategori dan subfolder
            const folderPath = subfolder ?
                path.join('./downloads', category, subfolder) :
                path.join('./downloads', category);

            await fs.ensureDir(folderPath);

            const filePath = path.join(folderPath, fileName);
            const writer = fs.createWriteStream(filePath);

            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(filePath));
                writer.on('error', reject);
            });

        } catch (error) {
            console.error('Error downloading file:', error);
            throw error;
        }
    }

    // Method untuk membersihkan nama file
    sanitizeFileName(fileName) {
        return fileName
            .replace(/[^\w\s-]/g, '') // Hapus karakter khusus
            .replace(/\s+/g, '_') // Ganti spasi dengan underscore
            .replace(/_+/g, '_') // Hapus underscore berulang
            .substring(0, 100); // Batasi panjang nama file
    }

    // Method untuk download carousel lengkap
    async downloadCarousel(contentInfo, category) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
            const authorName = this.sanitizeFileName(contentInfo.author.username);
            const titleName = this.sanitizeFileName(contentInfo.title);

            const carouselFolder = `${authorName}_${titleName}_${timestamp}`;
            const results = {
                success: true,
                type: 'carousel',
                folder: carouselFolder,
                files: {
                    images: [],
                    music: null,
                    info: null
                },
                info: contentInfo
            };

            console.log(`Downloading carousel to folder: ${carouselFolder}`);

            // Download semua gambar
            for (const image of contentInfo.images) {
                try {
                    const imageFileName = `image_${String(image.index).padStart(2, '0')}.jpg`;
                    const imagePath = await this.downloadFile(
                        image.url,
                        imageFileName,
                        category,
                        carouselFolder
                    );

                    results.files.images.push({
                        index: image.index,
                        fileName: imageFileName,
                        path: imagePath
                    });

                    console.log(`✓ Downloaded image ${image.index}: ${imageFileName}`);
                } catch (error) {
                    console.error(`✗ Failed to download image ${image.index}:`, error.message);
                }
            }

            // Download musik jika tersedia
            if (contentInfo.music && contentInfo.music.url) {
                try {
                    const musicFileName = `${this.sanitizeFileName(contentInfo.music.title)}_${this.sanitizeFileName(contentInfo.music.author)}.mp3`;
                    const musicPath = await this.downloadFile(
                        contentInfo.music.url,
                        musicFileName,
                        category,
                        carouselFolder
                    );

                    results.files.music = {
                        fileName: musicFileName,
                        path: musicPath
                    };

                    console.log(`✓ Downloaded music: ${musicFileName}`);
                } catch (error) {
                    console.error('✗ Failed to download music:', error.message);
                }
            }

            // Simpan informasi lengkap ke file JSON
            const infoFileName = 'info.json';
            const infoPath = path.join('./downloads', category, carouselFolder, infoFileName);
            await fs.writeJSON(infoPath, contentInfo, { spaces: 2 });

            results.files.info = {
                fileName: infoFileName,
                path: infoPath
            };

            console.log(`✓ Saved info: ${infoFileName}`);

            return results;

        } catch (error) {
            console.error('Error downloading carousel:', error);
            return {
                success: false,
                error: 'Terjadi kesalahan saat mendownload carousel'
            };
        }
    }

    // Method untuk download video lengkap
    async downloadVideo(contentInfo, category) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
            const authorName = this.sanitizeFileName(contentInfo.author.username);
            const titleName = this.sanitizeFileName(contentInfo.title);

            const videoFolder = `${authorName}_${titleName}_${timestamp}`;
            const results = {
                success: true,
                type: 'video',
                folder: videoFolder,
                files: {
                    video: null,
                    music: null,
                    info: null
                },
                info: contentInfo
            };

            console.log(`Downloading video to folder: ${videoFolder}`);

            // Download video (prioritas tanpa watermark)
            const videoUrl = contentInfo.video.noWatermark || contentInfo.video.watermark;
            if (videoUrl) {
                try {
                    const videoFileName = `${titleName}.mp4`;
                    const videoPath = await this.downloadFile(
                        videoUrl,
                        videoFileName,
                        category,
                        videoFolder
                    );

                    results.files.video = {
                        fileName: videoFileName,
                        path: videoPath,
                        hasWatermark: !contentInfo.video.noWatermark
                    };

                    console.log(`✓ Downloaded video: ${videoFileName}`);
                } catch (error) {
                    console.error('✗ Failed to download video:', error.message);
                }
            }

            // Download musik jika tersedia
            if (contentInfo.music && contentInfo.music.url) {
                try {
                    const musicFileName = `${this.sanitizeFileName(contentInfo.music.title)}_${this.sanitizeFileName(contentInfo.music.author)}.mp3`;
                    const musicPath = await this.downloadFile(
                        contentInfo.music.url,
                        musicFileName,
                        category,
                        videoFolder
                    );

                    results.files.music = {
                        fileName: musicFileName,
                        path: musicPath
                    };

                    console.log(`✓ Downloaded music: ${musicFileName}`);
                } catch (error) {
                    console.error('✗ Failed to download music:', error.message);
                }
            }

            // Simpan informasi lengkap ke file JSON
            const infoFileName = 'info.json';
            const infoPath = path.join('./downloads', category, videoFolder, infoFileName);
            await fs.writeJSON(infoPath, contentInfo, { spaces: 2 });

            results.files.info = {
                fileName: infoFileName,
                path: infoPath
            };

            console.log(`✓ Saved info: ${infoFileName}`);

            return results;

        } catch (error) {
            console.error('Error downloading video:', error);
            return {
                success: false,
                error: 'Terjadi kesalahan saat mendownload video'
            };
        }
    }

    // Method utama untuk proses download lengkap
    async processDownload(url, category = 'tiktok') {
        try {
            console.log('='.repeat(50));
            console.log('🚀 Starting TikTok download process...');
            console.log('URL:', url);
            console.log('='.repeat(50));

            // Dapatkan informasi konten
            const contentInfo = await this.downloadContent(url);

            if (!contentInfo.success) {
                return {
                    success: false,
                    error: contentInfo.error || 'Gagal mendapatkan informasi konten'
                };
            }

            console.log(`📱 Content Type: ${contentInfo.type.toUpperCase()}`);
            console.log(`👤 Author: ${contentInfo.author.nickname} (@${contentInfo.author.username})`);
            console.log(`📝 Title: ${contentInfo.title}`);

            if (contentInfo.type === 'carousel') {
                console.log(`🖼️  Images: ${contentInfo.images.length} items`);
                console.log(`🎵 Music: ${contentInfo.music.title} - ${contentInfo.music.author}`);
                return await this.downloadCarousel(contentInfo, category);
            } else {
                console.log(`🎬 Video Duration: ${contentInfo.video.duration}s`);
                console.log(`🎵 Music: ${contentInfo.music.title} - ${contentInfo.music.author}`);
                return await this.downloadVideo(contentInfo, category);
            }

        } catch (error) {
            console.error('❌ Process download error:', error);
            return {
                success: false,
                error: 'Terjadi kesalahan saat memproses download'
            };
        }
    }

    // Method untuk menampilkan statistik konten
    displayStats(contentInfo) {
        if (!contentInfo.stats) return;

        console.log('\n📊 Content Statistics:');
        console.log(`   Views: ${this.formatNumber(contentInfo.stats.views)}`);
        console.log(`   Likes: ${this.formatNumber(contentInfo.stats.likes)}`);
        console.log(`   Comments: ${this.formatNumber(contentInfo.stats.comments)}`);
        console.log(`   Shares: ${this.formatNumber(contentInfo.stats.shares)}`);

        if (contentInfo.create_time) {
            console.log(`   Created: ${new Date(contentInfo.create_time * 1000).toLocaleDateString()}`);
        }
    }

    // Helper untuk format angka
    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }
}

module.exports = TikTokDownloader;