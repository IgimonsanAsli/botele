const axios = require('axios');

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
            this.bot.sendMessage(
                chatId,
                '❌ <b>Cara penggunaan:</b>\n\n' +
                '<code>/tiktok &lt;link_tiktok&gt;</code>\n' +
                '<code>/t &lt;link_tiktok&gt;</code>\n\n' +
                '<b>Contoh:</b>\n' +
                '<code>/tiktok https://vt.tiktok.com/xxxxx</code>\n' +
                '<code>/t https://vm.tiktok.com/xxxxx</code>',
                { parse_mode: 'HTML' }
            );
            return;
        }

        // Validasi apakah URL mengandung domain TikTok
        if (!url.match(/tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com/i)) {
            this.bot.sendMessage(
                chatId,
                '❌ <b>URL tidak valid!</b>\n\nPastikan ini adalah link TikTok yang benar.',
                { parse_mode: 'HTML' }
            );
            return;
        }

        await this.processTikTok(chatId, url);
    }

    // Method utama untuk memproses TikTok
    async processTikTok(chatId, url) {
        let statusMsg;

        try {
            statusMsg = await this.bot.sendMessage(chatId, '⏳ Memproses konten TikTok...');

            // Gunakan method downloadContent untuk mendapatkan info konten
            const contentInfo = await this.downloadContent(url);

            if (!contentInfo.success) {
                await this.bot.editMessageText(
                    `❌ <b>${contentInfo.error || 'Gagal mengunduh konten TikTok'}</b>\n\n` +
                    '<b>Pastikan:</b>\n' +
                    '• Link masih aktif\n' +
                    '• Video tidak di-private\n' +
                    '• Format URL benar',
                    {
                        chat_id: chatId,
                        message_id: statusMsg.message_id,
                        parse_mode: 'HTML'
                    }
                );
                return;
            }

            // Update status
            await this.bot.editMessageText(
                '📥 Mendownload konten...',
                {
                    chat_id: chatId,
                    message_id: statusMsg.message_id
                }
            );

            // Handle berdasarkan tipe konten
            if (contentInfo.type === 'carousel') {
                await this.sendCarousel(chatId, contentInfo, statusMsg);
            } else {
                await this.sendVideo(chatId, contentInfo, statusMsg);
            }

        } catch (error) {
            console.error('Error TikTok:', error);

            let errorMessage = '❌ <b>Terjadi kesalahan saat memproses TikTok</b>\n\n';

            if (error.code === 'ECONNABORTED') {
                errorMessage += '⏱️ Timeout: Konten terlalu besar atau koneksi lambat. Coba lagi.';
            } else if (error.response?.status === 404) {
                errorMessage += '🔍 Video tidak ditemukan. Link mungkin salah atau video sudah dihapus.';
            } else if (error.response?.status === 403) {
                errorMessage += '🚫 Akses ditolak. Video mungkin di-private atau dibatasi.';
            } else if (error.message?.includes('Invalid')) {
                errorMessage += '⚠️ Format URL tidak valid. Pastikan menggunakan link TikTok yang benar.';
            } else {
                errorMessage += `⚠️ ${this.escapeHtml(error.message)}`;
            }

            if (statusMsg) {
                this.bot.editMessageText(errorMessage, {
                    chat_id: chatId,
                    message_id: statusMsg.message_id,
                    parse_mode: 'HTML'
                }).catch(() => {
                    this.bot.sendMessage(chatId, errorMessage, { parse_mode: 'HTML' });
                });
            } else {
                this.bot.sendMessage(chatId, errorMessage, { parse_mode: 'HTML' });
            }
        }
    }

    // Method untuk mengirim carousel
    async sendCarousel(chatId, contentInfo, statusMsg) {
        try {
            // Hapus status message
            await this.bot.deleteMessage(chatId, statusMsg.message_id);

            // Kirim info carousel
            await this.bot.sendMessage(
                chatId,
                `🖼️ <b>TikTok Carousel</b>\n\n` +
                `👤 <b>Author:</b> ${this.escapeHtml(contentInfo.author.nickname)} (@${this.escapeHtml(contentInfo.author.username)})\n` +
                `📝 ${this.escapeHtml(contentInfo.title)}\n` +
                `🎵 <b>Music:</b> ${this.escapeHtml(contentInfo.music.title)} - ${this.escapeHtml(contentInfo.music.author)}\n\n` +
                `📊 ${this.formatStats(contentInfo.stats)}\n\n` +
                `⬇️ Mengunduh ${contentInfo.images.length} gambar...`,
                { parse_mode: 'HTML' }
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
                        caption: `🎵 ${this.escapeHtml(contentInfo.music.title)} - ${this.escapeHtml(contentInfo.music.author)}`
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

    // Method untuk mengirim video dengan progress tracker
    async sendVideo(chatId, contentInfo, statusMsg) {
        try {
            const videoUrl = contentInfo.video.noWatermark || contentInfo.video.watermark;

            if (!videoUrl) {
                await this.bot.editMessageText(
                    '❌ <b>URL video tidak ditemukan</b>',
                    {
                        chat_id: chatId,
                        message_id: statusMsg.message_id,
                        parse_mode: 'HTML'
                    }
                );
                return;
            }

            const hasWatermark = !contentInfo.video.noWatermark;
            const watermarkText = hasWatermark ? '⚠️ <i>Video dengan watermark</i>' : '✅ <i>Video tanpa watermark</i>';

            // Kirim thumbnail dengan info
            let thumbnailMsg;
            if (contentInfo.author.avatar) {
                try {
                    thumbnailMsg = await this.bot.sendPhoto(chatId, contentInfo.author.avatar, {
                        caption:
                            `🎵 <b>TikTok Video</b>\n\n` +
                            `👤 <b>Author:</b> ${this.escapeHtml(contentInfo.author.nickname)} (@${this.escapeHtml(contentInfo.author.username)})\n` +
                            `📝 ${this.escapeHtml(contentInfo.title)}\n` +
                            `🎵 <b>Music:</b> ${this.escapeHtml(contentInfo.music.title)} - ${this.escapeHtml(contentInfo.music.author)}\n` +
                            `⏱️ <b>Duration:</b> ${contentInfo.video.duration}s\n\n` +
                            `📊 ${this.formatStats(contentInfo.stats)}\n\n` +
                            `<i>Memulai download...</i>`,
                        parse_mode: 'HTML'
                    });
                } catch (thumbError) {
                    console.warn('Failed to send avatar:', thumbError.message);
                }
            }

            // Download video dengan streaming dan progress tracking
            console.log(`📥 Downloading from: ${videoUrl}`);

            const videoResponse = await axios.get(videoUrl, {
                responseType: 'stream',
                timeout: 180000, // 3 menit
                maxContentLength: 52428800, // 50MB
                maxBodyLength: 52428800,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': '*/*'
                }
            });

            // Setup progress tracking
            const contentLength = parseInt(videoResponse.headers['content-length'] || 0);
            let downloadedBytes = 0;
            let lastUpdateTime = Date.now();
            const startTime = Date.now();
            let isUpdating = false;

            const updateInterval = 5000; // 5 detik
            let lastPercentage = 0;

            videoResponse.data.on('data', async (chunk) => {
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
                            `🎵 <b>TikTok Video</b>\n\n` +
                            `👤 <b>Author:</b> ${this.escapeHtml(contentInfo.author.nickname)} (@${this.escapeHtml(contentInfo.author.username)})\n` +
                            `📝 ${this.escapeHtml(contentInfo.title)}\n` +
                            `🎵 <b>Music:</b> ${this.escapeHtml(contentInfo.music.title)} - ${this.escapeHtml(contentInfo.music.author)}\n` +
                            `⏱️ <b>Duration:</b> ${contentInfo.video.duration}s\n\n` +
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

            // Kirim video
            const videoCaption =
                `🎵 <b>TikTok Video</b>\n\n` +
                `👤 <b>Author:</b> ${this.escapeHtml(contentInfo.author.nickname)} (@${this.escapeHtml(contentInfo.author.username)})\n` +
                `📝 ${this.escapeHtml(contentInfo.title)}\n` +
                `🎵 <b>Music:</b> ${this.escapeHtml(contentInfo.music.title)} - ${this.escapeHtml(contentInfo.music.author)}\n` +
                `⏱️ <b>Duration:</b> ${contentInfo.video.duration}s\n\n` +
                `📊 ${this.formatStats(contentInfo.stats)}\n\n` +
                `${watermarkText}`;

            await this.bot.sendVideo(
                chatId,
                videoResponse.data,
                {
                    caption: videoCaption,
                    parse_mode: 'HTML',
                    supports_streaming: true
                },
                {
                    filename: `${this.sanitizeFilename(contentInfo.title)}.mp4`,
                    contentType: 'video/mp4'
                }
            );

            // Hapus status message
            await this.bot.deleteMessage(chatId, statusMsg.message_id);

            console.log('✅ TikTok video sent successfully');

        } catch (error) {
            console.error('Error sending video:', error);
            throw error;
        }
    }

    // Helper untuk format stats
    formatStats(stats) {
        if (!stats) return '';

        return `👁️ ${this.formatNumber(stats.views)} • ❤️ ${this.formatNumber(stats.likes)} • 💬 ${this.formatNumber(stats.comments)} • 🔄 ${this.formatNumber(stats.shares)}`;
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
        if (!filename) return 'video';
        return filename
            .replace(/[<>:"/\\|?*]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 100);
    }
}

module.exports = TikTokDownloader;