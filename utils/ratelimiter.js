/**
 * Rate Limiter untuk Telegram Bot
 * Mencegah spam dengan membatasi request per user
 */

class RateLimiter {
  constructor(options = {}) {
    // Konfigurasi default
    this.maxRequests = options.maxRequests || 5; // Maksimal request
    this.timeWindow = options.timeWindow || 2 * 60 * 1000; // Time window dalam ms (default: 2 menit)
    this.blockDuration = options.blockDuration || 2 * 60 * 1000; // Durasi block (default: 2 menit)
    
    // Storage untuk tracking requests
    // Format: { userId: { requests: [timestamp1, timestamp2, ...], blockedUntil: timestamp } }
    this.userRequests = new Map();
    
    // Auto cleanup setiap 10 menit
    this.startCleanup();
  }

  /**
   * Cek apakah user di-rate limit
   * @param {number} userId - Telegram user ID
   * @returns {Object} { allowed: boolean, remainingTime: number|null, message: string|null }
   */
  checkLimit(userId) {
    const now = Date.now();
    
    // Ambil data user atau buat baru
    if (!this.userRequests.has(userId)) {
      this.userRequests.set(userId, {
        requests: [],
        blockedUntil: null
      });
    }
    
    const userData = this.userRequests.get(userId);
    
    // Cek apakah user sedang di-block
    if (userData.blockedUntil && now < userData.blockedUntil) {
      const remainingMs = userData.blockedUntil - now;
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      
      let timeString;
      if (minutes > 0) {
        timeString = `${minutes} menit ${seconds} detik`;
      } else {
        timeString = `${seconds} detik`;
      }
      
      return {
        allowed: false,
        remainingTime: remainingMs,
        message: `⏳ *Kamu terlalu sering menggunakan fitur!*\n\nCoba lagi dalam *${timeString}*\n\n_Limit: ${this.maxRequests} request per ${this.timeWindow / 60000} menit_`
      };
    }
    
    // Hapus request yang sudah expired (di luar time window)
    userData.requests = userData.requests.filter(timestamp => 
      now - timestamp < this.timeWindow
    );
    
    // Cek apakah sudah melebihi limit
    if (userData.requests.length >= this.maxRequests) {
      // Block user
      userData.blockedUntil = now + this.blockDuration;
      
      const minutes = Math.floor(this.blockDuration / 60000);
      const seconds = Math.floor((this.blockDuration % 60000) / 1000);
      
      let timeString;
      if (minutes > 0) {
        timeString = `${minutes} menit`;
      } else {
        timeString = `${seconds} detik`;
      }
      
      console.log(`🚫 Rate limit: User ${userId} blocked for ${timeString}`);
      
      return {
        allowed: false,
        remainingTime: this.blockDuration,
        message: `⏳ *Kamu terlalu sering menggunakan fitur!*\n\nCoba lagi dalam *${timeString}*\n\n_Limit: ${this.maxRequests} request per ${this.timeWindow / 60000} menit_`
      };
    }
    
    // Tambah request baru
    userData.requests.push(now);
    
    return {
      allowed: true,
      remainingTime: null,
      message: null
    };
  }

  /**
   * Reset limit untuk user tertentu (untuk admin/debug)
   * @param {number} userId - Telegram user ID
   */
  resetUser(userId) {
    if (this.userRequests.has(userId)) {
      this.userRequests.delete(userId);
      console.log(`✅ Rate limit reset for user ${userId}`);
      return true;
    }
    return false;
  }

  /**
   * Dapatkan statistik user
   * @param {number} userId - Telegram user ID
   * @returns {Object} Statistik user
   */
  getUserStats(userId) {
    if (!this.userRequests.has(userId)) {
      return {
        requestCount: 0,
        isBlocked: false,
        remainingRequests: this.maxRequests
      };
    }
    
    const userData = this.userRequests.get(userId);
    const now = Date.now();
    
    // Filter request yang masih valid
    const validRequests = userData.requests.filter(timestamp => 
      now - timestamp < this.timeWindow
    );
    
    return {
      requestCount: validRequests.length,
      isBlocked: userData.blockedUntil && now < userData.blockedUntil,
      remainingRequests: Math.max(0, this.maxRequests - validRequests.length),
      blockedUntil: userData.blockedUntil
    };
  }

  /**
   * Cleanup otomatis untuk menghapus data user yang sudah tidak aktif
   */
  startCleanup() {
    setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;
      
      for (const [userId, userData] of this.userRequests.entries()) {
        // Hapus request yang expired
        userData.requests = userData.requests.filter(timestamp => 
          now - timestamp < this.timeWindow
        );
        
        // Hapus user jika tidak ada request dan tidak di-block
        if (userData.requests.length === 0 && (!userData.blockedUntil || now > userData.blockedUntil)) {
          this.userRequests.delete(userId);
          cleanedCount++;
        }
      }
      
      if (cleanedCount > 0) {
        console.log(`🧹 Rate limiter cleanup: Removed ${cleanedCount} inactive users`);
      }
    }, 10 * 60 * 1000); // Cleanup setiap 10 menit
  }

  /**
   * Dapatkan total user yang sedang di-track
   */
  getTotalUsers() {
    return this.userRequests.size;
  }

  /**
   * Dapatkan statistik global
   */
  getGlobalStats() {
    const now = Date.now();
    let totalBlocked = 0;
    let totalActive = 0;
    
    for (const [userId, userData] of this.userRequests.entries()) {
      if (userData.blockedUntil && now < userData.blockedUntil) {
        totalBlocked++;
      }
      if (userData.requests.length > 0) {
        totalActive++;
      }
    }
    
    return {
      totalUsers: this.userRequests.size,
      blockedUsers: totalBlocked,
      activeUsers: totalActive
    };
  }
}

module.exports = RateLimiter;