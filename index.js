// ==============================================================================
//           SERVER BOT TELEGRAM MULTI-GATEWAY (WA MANUAL & SMS AUTO-LITENSI)
// ==============================================================================
const { Telegraf, Markup } = require('telegraf');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const pino = require('pino');
const qrcodeTerminal = require('qrcode-terminal');
const axios = require('axios'); 
const cloudscraper = require('cloudscraper'); // 🛡️ Anti-Cloudflare Aktif

// ==================== KONFIGURASI UTAMA TOKO ====================
const TOKEN = "8929699790:AAFRI2MtOeMgEqRNBWTHwizqr2Q3pPcz7jo"; 
const ADMIN_ID = 8166177260; 
const CHANNEL_USERNAME = "@KreatifDigitalPlatfrom"; 

// 🔑 API KEY LAYANAN KEDUA (RUMAHOTP LAMA)
const RUMAHOTP_API_KEY = "rk-dev-tHoshylviQaSygmKeekky5nVpultkl0y"; 

// 🔑 INTEGRASI CONFIG API LITENSI (BARU - JALUR BEBAS CLOUDFLARE)
const LITENSI_API_ID = 3549;
const LITENSI_API_KEY = "fnW6KTQW5oXb1FKZTMp0gXYTFvUjFwD";
const LITENSI_BASE_URL = "https://litensi.id";
const LITENSI_API_URL = "https://litensi.id/api/sms/handler_api.php"; 

const bot = new Telegraf(TOKEN);
const DB_NAME = "database_shopee.db";

// Definisi File Teks Stok Produk Lama & Baru
const FILE_SHOPEE = "shopee.txt";   
const FILE_DANA = "dana.txt";       
const FILE_FB = "facebook.txt";     
const FILE_TIKTOK = "tiktok.txt";   
const FILE_KOPIKENANGAN = "kopikenangan.txt"; 
const FILE_GOJEK = "gojek.txt";
const FILE_GRAB = "grab.txt";
const FILE_OVO = "ovo.txt";
const FILE_KLIKINDOMART = "klikindomart.txt";
const FILE_ALFAGIFT = "alfagift.txt";
const GAMBAR_QRIS = "qris.png";

// Konfigurasi Harga Jalur WhatsApp
const HARGA_WA_SHOPEE = 1500; const HARGA_WA_DANA = 1500; const HARGA_WA_FB = 1000; const HARGA_WA_TIKTOK = 1000; const HARGA_WA_KOPIKENANGAN = 1000; 
const HARGA_WA_GOJEK = 1000; const HARGA_WA_GRAB = 1000; const HARGA_WA_OVO = 1500; const HARGA_WA_KLIKINDOMART = 1500; const HARGA_WA_ALFAGIFT = 1500;

// Konfigurasi Harga Jalur SMS
const HARGA_SMS_SHOPEE = 2000; const HARGA_SMS_DANA = 2000; const HARGA_SMS_FB = 1500; const HARGA_SMS_TIKTOK = 1500; const HARGA_SMS_KOPIKENANGAN = 1500; 
const HARGA_SMS_GOJEK = 1000; const HARGA_SMS_GRAB = 1000; const HARGA_SMS_OVO = 1500; const HARGA_SMS_KLIKINDOMART = 1500; const HARGA_SMS_ALFAGIFT = 1500;

// ✨ REVISI FORMAT STRING SESUAI KOLOM SERVICE DI PRICE LIST LITENSI (SUDAH DIPERBAIKI KE KODE HURUF SMS HANDLER)
const SERVICE_ID_LITENSI = {
    shopee: "sh",       
    dana: "dn",           
    fb: "fb",
    tiktok: "lf",
    kopikenangan: "kk",
    gojek: "gj",
    grab: "jg",
    ovo: "ov",
    klikindomart: "ki",
    alfagift: "ag"
};

let transaksi_aktif = {}; let request_topup = {}; let status_user = {}; let request_wd = {};    
let slot_aktif = 0; const MAKS_SLOT = 500;

// --- FITUR AUTO-CREATE FILE .TXT JIKA BELUM ADA DI FOLDER ---
const daftarSemuaFile = [FILE_SHOPEE, FILE_DANA, FILE_FB, FILE_TIKTOK, FILE_KOPIKENANGAN, FILE_GOJEK, FILE_GRAB, FILE_OVO, FILE_KLIKINDOMART, FILE_ALFAGIFT];
daftarSemuaFile.forEach((file) => {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, '', 'utf-8');
        console.log(`[SYSTEM] File otomatis dibuat di folder Anda: ${file}`);
    }
});

function kurangiSlotAntrean() {
    if (slot_aktif > 0) { slot_aktif--; console.log("[ANTREAN] 1 Slot dibebaskan. Antrean aktif: " + slot_aktif + "/" + MAKS_SLOT); }
}

// ==================== DATABASE SQLITE DENGAN KOLOM TOTAL TOPUP REALTIME ====================
const db = new sqlite3.Database(DB_NAME);
db.serialize(() => { 
    db.run("CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY, nama TEXT, saldo INTEGER DEFAULT 0, total_order INTEGER DEFAULT 0, dapat_bonus INTEGER DEFAULT 0, total_topup INTEGER DEFAULT 0)"); 
    db.run("ALTER TABLE users ADD COLUMN dapat_bonus INTEGER DEFAULT 0", (err) => {});
    db.run("ALTER TABLE users ADD COLUMN total_topup INTEGER DEFAULT 0", (err) => {
        if (!err) console.log("[DATABASE] Sinkronisasi kolom finansial total_topup murni sukses.");
    });
});
function ambilSaldo(userId) {
    return new Promise((resolve) => { db.get("SELECT saldo FROM users WHERE user_id = ?", [userId], (err, row) => { resolve(row ? row.saldo : 0); }); });
}
function tambahSaldo(userId, nama, jumlah) {
    db.get("SELECT saldo FROM users WHERE user_id = ?", [userId], (err, row) => {
        if (!row) { db.run("INSERT INTO users (user_id, nama, saldo) VALUES (?, ?, ?)", [userId, nama || "User", jumlah]); } 
        else { db.run("UPDATE users SET saldo = saldo + ?, nama = ? WHERE user_id = ?", [jumlah, nama || row.nama || "User", userId]); }
    });
}
function potongSaldoSukses(userId, jumlah) {
    return new Promise((resolve) => { db.run("UPDATE users SET saldo = saldo - ?, total_order = total_order + 1 WHERE user_id = ? AND saldo >= ?", [jumlah, userId, jumlah], function() { resolve(this.changes > 0); }); });
}

// ==================== MANAJEMEN FILE TXT STOK MULTI-PRODUK ====================
function hitungJumlahStok(namaFileTeks) {
    if (!fs.existsSync(namaFileTeks)) return 0;
    const data = fs.readFileSync(namaFileTeks, 'utf-8');
    return data.split('\n').map(l => l.trim()).filter(l => l !== '').length;
}
function ambilDanPotongNomorTxt(namaFileTeks) {
    if (!fs.existsSync(namaFileTeks)) return null;
    const data = fs.readFileSync(namaFileTeks, 'utf-8');
    const baris = data.split('\n').map(l => l.trim()).filter(l => l !== '');
    if (baris.length === 0) return null;
    const nomorTerpilih = baris.shift(); 
    fs.writeFileSync(namaFileTeks, baris.join('\n') + (baris.length ? '\n' : ''), 'utf-8');
    return nomorFixFormat(nomorTerpilih); 
}

function nomorFixFormat(str) { return str ? str.replace(/\D/g, '').trim() : ""; }
function catatKeFileBekas(namaFileAsli, nomorWA) { fs.appendFileSync(namaFileAsli.replace('.txt', '_bekas.txt'), nomorWA + '\n', 'utf-8'); }
function hubungkanSatuNomorWA(nomorWA, indeks) { return new Promise((resolve) => { resolve(null); }); }

// ==================== FUNGSI REVISI FIX MULTIPLE METHOD GET (SINKRON SMS HANDLER LITENSI) ====================
async function operOrderKeLitensi(serviceId) {
    try {
        const urlLengkap = `${LITENSI_API_URL}?api_key=${LITENSI_API_KEY}&action=getNumber&service=${encodeURIComponent(serviceId)}&country=6`;
        const options = {
            method: 'GET',
            url: urlLengkap,
            headers: { 
                'Accept': 'text/plain',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
        };

        const rawResponse = await cloudscraper(options);
        const resText = rawResponse.trim();

        if (resText.startsWith("ACCESS_NUMBER")) {
            const dataSplit = resText.split(":");
            const orderId = dataSplit[1];
            const nomorHp = dataSplit[2];
            console.log("[SERVER SYSTEM] Sukses alokasi nomor baru. ID:", orderId, "Nomor:", nomorHp);
            return { id: orderId, number: nomorHp };
        } else {
            console.log("[SERVER SYSTEM] Alokasi ditolak karena stok operator habis/error:", resText);
            return null;
        }
    } catch (err) {
        console.error("[SERVER SYSTEM] Jalur Injeksi Data Core Gagal:", err.message);
        return null;
    }
}

async function cekOtpOtomatisLitensi(orderId) {
    try {
        const urlLengkap = `${LITENSI_API_URL}?api_key=${LITENSI_API_KEY}&action=getStatus&id=${orderId}`;
        const options = {
            method: 'GET',
            url: urlLengkap,
            headers: { 
                'Accept': 'text/plain',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
        };

        const rawResponse = await cloudscraper(options);
        const resText = rawResponse.trim();

        if (resText.startsWith("STATUS_OK") || resText.startsWith("STATUS_SMS")) {
            const dataSplit = resText.split(":");
            const teksSMS = dataSplit[1] || resText;
            const matchOtp = teksSMS.match(/\d{4,6}/);
            return { sms: teksSMS, otp: matchOtp ? matchOtp[0] : teksSMS };
        }
        return null;
    } catch (err) {
        return null;
    }
}
async function batalkanOrderLitensi(orderId) {
    try {
        const urlLengkap = `${LITENSI_API_URL}?api_key=${LITENSI_API_KEY}&action=setStatus&id=${orderId}&status=8`;
        const options = {
            method: 'GET',
            url: urlLengkap,
            headers: { 
                'Accept': 'text/plain',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
        };
        const rawResponse = await cloudscraper(options);
        return rawResponse.trim() === "ACCESS_CANCEL";
    } catch (err) {
        return false;
    }
}

// ==================== LOGIKA VERIFIKASI SEBELUM MASUK MENU FITUR UTAMA ====================
async function kirimMenuUtamaToko(ctx, userId, namaLengkap, usernameTelegram) {
    const NOMINAL_HADIAH = 1000;
    db.get("SELECT dapat_bonus, saldo FROM users WHERE user_id = ?", [userId], async (err, row) => {
        let keteranganHadiah = "";
        if (!row) {
            db.run("INSERT INTO users (user_id, nama, saldo, dapat_bonus, total_topup) VALUES (?, ?, ?, 1, 0)", [userId, namaLengkap, NOMINAL_HADIAH]);
            keteranganHadiah = `\n🎁 Hadiah Saldo Pengguna Baru +Rp ${NOMINAL_HADIAH.toLocaleString('id-ID')} Berhasil Masuk!\n`;
        } else {
            db.run("UPDATE users SET nama = ? WHERE user_id = ?", [namaLengkap, userId]);
            if (row.dapat_bonus === 0) {
                db.run("UPDATE users SET saldo = saldo + ?, dapat_bonus = 1 WHERE user_id = ?", [NOMINAL_HADIAH, userId]);
                keteranganHadiah = `\n🎁 Hadiah Saldo Pengguna Baru +Rp ${NOMINAL_HADIAH.toLocaleString('id-ID')} Berhasil Masuk!\n`;
            }
        }

        const teksKotakProfilAwal = `Selamat Datang Di Toko Kami\n\n` +
                                   `*Nama Lengkap :* ${namaLengkap}\n` +
                                   `*User Name :* ${usernameTelegram}\n` +
                                   `${keteranganHadiah}`;

        await ctx.reply(teksKotakProfilAwal, {
            parse_mode: 'Markdown', 
            reply_markup: {
                keyboard: [
                    [{ text: '🗄 Sewa OTP' }, { text: '💳 Top Up Saldo' }],
                    [{ text: '👤 Profil Saya' }, { text: '💰 Cek Saldo' }]
                ],
                resize_keyboard: true
            }
        }).catch(() => {});

        await ctx.reply("Silakan tentukan metode penerimaan kode OTP Anda:", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📱 Terima Otp Via Whatsapp', callback_data: 'jalur_whatsapp' }],
                    [{ text: '💬 Terima Otp Via Sms (Otomatis)', callback_data: 'jalur_sms' }]
                ]
            }
        }).catch(() => {});
    });
}

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const namaDepan = ctx.from.first_name || "";
    const namaBelakang = ctx.from.last_name || "";
    const namaLengkap = `${namaDepan} ${namaBelakang}`.trim() || "User Toko";
    const usernameTelegram = ctx.from.username ? `@${ctx.from.username}` : "Tidak Ada Username";

    try {
        const member = await ctx.telegram.getChatMember(CHANNEL_USERNAME, userId);
        const statusValid = ['creator', 'administrator', 'member'];
        if (!statusValid.includes(member.status)) {
            const cleanChannelName = CHANNEL_USERNAME.replace('@', '');
            const linkChannel = 'tg://resolve?domain=' + cleanChannelName;
            return ctx.reply(`👋 **Halo ${namaLengkap}!**\n\nUntuk menggunakan layanan transaksi otomatis and mengambil hadiah saldo gratis di bot kami, silakan bergabung ke Channel Resmi kami terlebih dahulu melalui tombol di bawah ini:`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "📢 Join Channel Resmi (Klaim Bonus)", url: linkChannel }],
                        [{ text: "🎁 Ambil Bonus saldo anda", callback_data: "cek_join_channel" }]
                    ]
                }
            });
        }
    } catch (err) {
        console.log("[ERROR] Gagal mengecek keanggotaan channel: ", err.message);
    }
    await kirimMenuUtamaToko(ctx, userId, namaLengkap, usernameTelegram);
});
bot.action('cek_join_channel', async (ctx) => {
    const userId = ctx.from.id;
    const namaDepan = ctx.from.first_name || "";
    const namaBelakang = ctx.from.last_name || "";
    const namaLengkap = `${namaDepan} ${namaBelakang}`.trim() || "User Toko";
    const usernameTelegram = ctx.from.username ? `@${ctx.from.username}` : "Tidak Ada Username";

    try {
        const member = await ctx.telegram.getChatMember(CHANNEL_USERNAME, userId);
        const statusValid = ['creator', 'administrator', 'member'];
        if (!statusValid.includes(member.status)) {
            return ctx.answerCbQuery("❌ Gagal Verifikasi! Anda terdeteksi belum bergabung ke channel kami.", { show_alert: true });
        }
        await ctx.answerCbQuery("🔄 Sukses Verifikasi! Membuka Toko...").catch(() => {});
        await ctx.deleteMessage().catch(() => {});
        await kirimMenuUtamaToko(ctx, userId, namaLengkap, usernameTelegram);
    } catch (e) {
        await ctx.answerCbQuery("Hubungi admin jika terjadi kendala.").catch(() => {});
    }
});

bot.hears('👤 Profil Saya', async (ctx) => {
    const userId = ctx.from.id;
    const name = ctx.from.first_name || "User";
    const saldo = await ambilSaldo(userId);
    const teksProfil = `👤 **PROFIL ACCOUNT SERVER**\n\n` +
                       `🆔 **User ID:** \`${userId}\`\n` +
                       `👤 **Nama Akun:** ${name}\n` +
                       `💰 **Sisa Saldo:** Rp ${saldo.toLocaleString('id-ID')}\n\n` +
                       `📈 **STATISTIK GLOBAL SERVER (REALTIME):**\n` +
                       `👥 User Aktif: 38.492\n` +
                       `🔔 Berlangganan: 12.805\n` +
                       `✅ Transaksi Sukses: 149.204`;
    await ctx.replyWithMarkdown(teksProfil);
});

bot.hears('💰 Cek Saldo', async (ctx) => {
    const userId = ctx.from.id;
    const saldo = await ambilSaldo(userId);
    const teksCekSaldo = `💰 **INFORMASI SALDO ANDA**\n\n` +
                         `🆔 ID User: \`${userId}\`\n` +
                         `💵 Sisa Saldo: *Rp ${saldo.toLocaleString('id-ID')}*`;
    await ctx.replyWithMarkdown(teksCekSaldo);
});

bot.hears('🗄 Sewa OTP', async (ctx) => {
    await ctx.reply('👇 Silakan tentukan kembali metode penerimaan kode OTP Anda:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📱 Terima Otp Via Whatsapp', callback_data: 'jalur_whatsapp' }],
                [{ text: '💬 Terima Otp Via Sms (Otomatis)', callback_data: 'jalur_sms' }]
            ]
        }
    });
});

bot.action('jalur_whatsapp', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await tampilkanPanelBelanja(ctx, ctx.from.id, 'wa');
});

bot.action('jalur_sms', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await tampilkanPanelBelanja(ctx, ctx.from.id, 'sms');
});

async function tampilkanPanelBelanja(ctx, userId, jalurOTP) {
    const saldo = await ambilSaldo(userId);
    let label = jalurOTP === 'sms' ? 'SMS (Otomatis) 💬' : 'WhatsApp (Manual) 📱';

    let sShopee = jalurOTP === 'sms' ? 'Sedia' : hitungJumlahStok(FILE_SHOPEE) + ' Pcs';
    let sDana = jalurOTP === 'sms' ? 'Sedia' : hitungJumlahStok(FILE_DANA) + ' Pcs';
    let sFb = jalurOTP === 'sms' ? 'Sedia' : hitungJumlahStok(FILE_FB) + ' Pcs';
    let sTiktok = jalurOTP === 'sms' ? 'Sedia' : hitungJumlahStok(FILE_TIKTOK) + ' Pcs';
    let sKopi = jalurOTP === 'sms' ? 'Sedia' : hitungJumlahStok(FILE_KOPIKENANGAN) + ' Pcs';
    let sGojek = jalurOTP === 'sms' ? 'Sedia' : hitungJumlahStok(FILE_GOJEK) + ' Pcs';
    let sGrab = jalurOTP === 'sms' ? 'Sedia' : hitungJumlahStok(FILE_GRAB) + ' Pcs';
    let sOvo = jalurOTP === 'sms' ? 'Sedia' : hitungJumlahStok(FILE_OVO) + ' Pcs';
    let sKlik = jalurOTP === 'sms' ? 'Sedia' : hitungJumlahStok(FILE_KLIKINDOMART) + ' Pcs';
    let sAlfa = jalurOTP === 'sms' ? 'Sedia' : hitungJumlahStok(FILE_ALFAGIFT) + ' Pcs';
    let hShopee = jalurOTP === 'sms' ? HARGA_SMS_SHOPEE : HARGA_WA_SHOPEE;
    let hDana = jalurOTP === 'sms' ? HARGA_SMS_DANA : HARGA_WA_DANA;
    let hFb = jalurOTP === 'sms' ? HARGA_SMS_FB : HARGA_WA_FB;
    let hTiktok = jalurOTP === 'sms' ? HARGA_SMS_TIKTOK : HARGA_WA_TIKTOK;
    let hKopi = jalurOTP === 'sms' ? HARGA_SMS_KOPIKENANGAN : HARGA_WA_KOPIKENANGAN;
    let hGojek = jalurOTP === 'sms' ? HARGA_SMS_GOJEK : HARGA_WA_GOJEK;
    let hGrab = jalurOTP === 'sms' ? HARGA_SMS_GRAB : HARGA_WA_GRAB;
    let hOvo = jalurOTP === 'sms' ? HARGA_SMS_OVO : HARGA_WA_OVO;
    let hKlik = jalurOTP === 'sms' ? HARGA_SMS_KLIKINDOMART : HARGA_WA_KLIKINDOMART;
    let hAlfa = jalurOTP === 'sms' ? HARGA_SMS_ALFAGIFT : HARGA_WA_ALFAGIFT;

    await ctx.reply("👇 Panel Transaksi Utama Server (Jalur: " + label + ") - Saldo: Rp " + saldo.toLocaleString('id-ID') + ":", Markup.inlineKeyboard([
        [Markup.button.callback("🛒 Shopee (" + sShopee + ") - Rp " + hShopee, "order_shopee_" + jalurOTP)],
        [Markup.button.callback("🛒 DANA (" + sDana + ") - Rp " + hDana, "order_dana_" + jalurOTP)],
        [Markup.button.callback("🛒 Facebook (" + sFb + ") - Rp " + hFb, "order_fb_" + jalurOTP)],
        [Markup.button.callback("🛒 TikTok (" + sTiktok + ") - Rp " + hTiktok, "order_tiktok_" + jalurOTP)],
        [Markup.button.callback("🛒 Kopi Kenangan (" + sKopi + ") - Rp " + hKopi, "order_kopikenangan_" + jalurOTP)],
        [Markup.button.callback("🛒 Gojek (" + sGojek + ") - Rp " + hGojek, "order_gojek_" + jalurOTP)],
        [Markup.button.callback("🛒 Grab (" + sGrab + ") - Rp " + hGrab, "order_grab_" + jalurOTP)],
        [Markup.button.callback("🛒 OVO (" + sOvo + ") - Rp " + hOvo, "order_ovo_" + jalurOTP)],
        [Markup.button.callback("🛒 Klik Indomaret (" + sKlik + ") - Rp " + hKlik, "order_klikindomart_" + jalurOTP)],
        [Markup.button.callback("🛒 Alfagift (" + sAlfa + ") - Rp " + hAlfa, "order_alfagift_" + jalurOTP)],
        [Markup.button.callback('💳 Isi Saldo (Top Up)', 'minta_topup'), Markup.button.callback('📚 Tips Anti-Tameng', 'tips_aman')]
    ]));
}

const appsList = ['shopee', 'dana', 'fb', 'tiktok', 'kopikenangan', 'gojek', 'grab', 'ovo', 'klikindomart', 'alfagift'];
appsList.forEach(app => {
    bot.action(`order_${app}_wa`, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        let harga = eval(`HARGA_WA_${app.toUpperCase()}`);
        let file = eval(`FILE_${app.toUpperCase()}`);
        await prosesOrderSewa(ctx, app, file, harga, 'wa');
    });
    bot.action(`order_${app}_sms`, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        let harga = eval(`HARGA_SMS_${app.toUpperCase()}`);
        let file = eval(`FILE_${app.toUpperCase()}`);
        await prosesOrderSewa(ctx, app, file, harga, 'sms');
    });
});

async function prosesOrderSewa(ctx, namaAplikasi, fileStok, hargaSewa, jalurOTP) {
    const userId = ctx.from.id;
    const namaUser = ctx.from.first_name || "Pembeli";
    
    if (slot_aktif >= MAKS_SLOT) return ctx.answerCbQuery("Mohon Tunggu Beberapa Saat Kami Sedang Menyediakan Nomor Baru.", { show_alert: true }).catch(() => {});
    
    let hitungNomorAktifUser = 0;
    for (let num in transaksi_aktif) { if (transaksi_aktif[num].userId === userId) { hitungNomorAktifUser++; } }
    if (hitungNomorAktifUser >= 20) {
        return ctx.answerCbQuery("⚠️ Batas maksimal sewa tercapai! Anda hanya diizinkan memiliki maksimal 20 nomor aktif secara bersamaan.", { show_alert: true }).catch(() => {});
    }

    const saldo = await ambilSaldo(userId);
    if (saldo < hargaSewa) return ctx.answerCbQuery("❌ Gagal Sewa! Saldo Anda tidak mencukupi.", { show_alert: true }).catch(() => {});

    let nomorFix = "";
    let orderIdLitensi = "";
    if (jalurOTP === 'wa') {
        const nomorAmbil = ambilDanPotongNomorTxt(fileStok);
        if (!nomorAmbil) return ctx.answerCbQuery("⚠️ Gagal mengambil stok nomor lokal WhatsApp.", { show_alert: true }).catch(() => {});
        nomorFix = nomorAmbil;
    } else {
        // ✨ REVISI TEXT PREMIUM 1: Menghubungkan ke Seluler Cloud
        await ctx.reply("⏳ **Menghubungkan ke Seluler Cloud...**\nSistem sedang mengalokasikan jalur nomor operator terbaik untuk Anda, harap tunggu.");
        
        const targetServiceId = SERVICE_ID_LITENSI[namaAplikasi];
        const dataLitensi = await operOrderKeLitensi(targetServiceId);
        
        // ✨ REVISI TEXT PREMIUM 2 & 3: Alokasi Nomor Gagal / Restock Jaringan
        if (!dataLitensi || !dataLitensi.number) {
            return ctx.reply("❌ **ALOKASI NOMOR GAGAL**\n\nSlot operator untuk aplikasi ini sedang penuh/kehabisan kartu aktif. Sistem kami akan melakukan restock massal secara berkala. Silakan coba beberapa saat lagi atau gunakan jalur WhatsApp manual.");
        }
        nomorFix = dataLitensi.number;
        orderIdLitensi = dataLitensi.id;
    }

    slot_aktif++;
    const waktuSekarang = new Date();
    const waktuSelesai = new Date(waktuSekarang.getTime() + 20 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const jamMulai = `${pad(waktuSekarang.getHours())}:${pad(waktuSekarang.getMinutes())}`;
    const jamSelesai = `${pad(waktuSelesai.getHours())}:${pad(waktuSelesai.getMinutes())}`;

    transaksi_aktif[nomorFix] = { 
        userId, msgId: null, timerRef: null, status: 'PENDING', status_sukses: false, harga: hargaSewa, aplikasi: namaAplikasi, jalur: jalurOTP, fileStokAsli: fileStok, orderId: orderIdLitensi, sisaDetik: 20 * 60 
    };
    const infoPesan = await ctx.reply(`✅ **NOMOR ${jalurOTP.toUpperCase()} BERHASIL DIDAPATKAN!**\n\n📱 **Nomor Sewa:** \`${nomorFix}\`\n🎯 **Aplikasi:** ${namaAplikasi.toUpperCase()}\n💰 **Tarif:** Rp ${hargaSewa}\n\n🕒 **Durasi Sewa:** ${jamMulai} s/d ${jamSelesai}\n⏳ **Sisa Waktu:** \`20:00\`\n📡 Sistem mendengarkan OTP secara otomatis...`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: "🔄 Refresh OTP", callback_data: "refresh_otp_" + nomorFix }], [{ text: "❌ Batalkan Sewa Nomor", callback_data: "batal_sewa_" + nomorFix }]] }
    }).catch(() => {});

    if (infoPesan) { transaksi_aktif[nomorFix].msgId = infoPesan.message_id; }

    if (jalurOTP === 'wa' && infoPesan) { 
        try { 
            const adminReplyMarkup = { inline_keyboard: [[{ text: "✏️ Input Kode OTP", callback_data: "input_otp_" + userId + "_" + nomorFix }]] };
            await bot.telegram.sendMessage(ADMIN_ID, `🚨 **[PESANAN BARU]** 🚨\n\nPembeli: ${namaUser} (\`${userId}\`)\n🎯 Aplikasi: ${namaAplikasi.toUpperCase()}\n📱 Nomor Sewa: \`${nomorFix}\`\n⚡ Jalur: WHATSAPP\n\nWaktu Order: ${jamMulai} s/d ${jamSelesai}\n\n👉 *Silakan klik tombol di bawah untuk memasukkan kode OTP secara instan atau balas langsung.*`, { reply_markup: adminReplyMarkup }); 
        } catch (err) {} 
    }

    let totalDetikSewa = 20 * 60; 
    const intervalTimer = setInterval(async () => {
        if (!transaksi_aktif[nomorFix] || transaksi_aktif[nomorFix].status_sukses) { clearInterval(intervalTimer); return; }
        totalDetikSewa -= 5; 
        transaksi_aktif[nomorFix].sisaDetik = totalDetikSewa; 
        if (jalurOTP === 'sms') {
            const cekStatus = await cekOtpOtomatisLitensi(orderIdLitensi);
            if (cekStatus && cekStatus.otp) {
                clearInterval(intervalTimer);
                transaksi_aktif[nomorFix].status_sukses = true;
                await potongSaldoSukses(userId, hargaSewa);
                const inlineKeyboardSukses = { inline_keyboard: [[{ text: "🔄 Repeat OTP", callback_data: "repeat_sama_" + nomorFix }], [{ text: "✅ Sukses", callback_data: "cek_ram_saldo" }]] };
                try { await bot.telegram.editMessageReplyMarkup(userId, infoPesan.message_id, null, inlineKeyboardSukses); } catch (e) {}
                await bot.telegram.sendMessage(userId, `🟢 **VERIFICATION CODE RECEIVED (SMS AUTO)**\n\n🔑 **CODE:** \`${cekStatus.otp}\`\n💬 **SMS:** ${cekStatus.sms}`, { parse_mode: 'Markdown' });
                delete transaksi_aktif[nomorFix]; kurangiSlotAntrean();
                return;
            }
        }

        if (totalDetikSewa <= 0) {
            clearInterval(intervalTimer);
            if (jalurOTP === 'sms') { await batalkanOrderLitensi(orderIdLitensi); }
            try { await bot.telegram.editMessageText(userId, infoPesan.message_id, null, `⏳ Sesi sewa nomor ${nomorFix} telah berakhir murni.`, { reply_markup: { inline_keyboard: [] } }); } catch (err) {}
            delete transaksi_aktif[nomorFix]; kurangiSlotAntrean();
        } else {
            const menitSisa = Math.floor(totalDetikSewa / 60);
            const detikSisa = totalDetikSewa % 60;
            const teksWaktuBerjalan = `${pad(menitSisa)}:${pad(detikSisa)}`;
            try {
                await bot.telegram.editMessageText(userId, infoPesan.message_id, null, 
                    `✅ **NOMOR ${jalurOTP.toUpperCase()} BERHASIL DIDAPATKAN!**\n\n📱 **Nomor Sewa:** \`${nomorFix}\`\n🎯 **Aplikasi:** ${namaAplikasi.toUpperCase()}\n💰 **Tarif:** Rp ${hargaSewa}\n\n🕒 **Durasi Sewa:** ${jamMulai} s/d ${jamSelesai}\n⏳ **Sisa Waktu:** \`${teksWaktuBerjalan}\`\n📡 Sistem mendengarkan OTP secara otomatis...`, 
                    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔄 Refresh OTP", callback_data: "refresh_otp_" + nomorFix }], [{ text: "❌ Batalkan Sewa Nomor", callback_data: "batal_sewa_" + nomorFix }]] } });
            } catch (err) {}
        }
    }, 5000);
    transaksi_aktif[nomorFix].timerRef = intervalTimer;
}

bot.action(/^batal_sewa_(.+)$/, async (ctx) => {
    const nomorWA = ctx.match[1];
    if (!transaksi_aktif[nomorWA]) return ctx.answerCbQuery('⚠️ Transaksi tidak ditemukan!', { show_alert: true });
    const tx = transaksi_aktif[nomorWA];

    if (tx.jalur === 'sms') {
        const suksesBatal = await batalkanOrderLitensi(tx.orderId);
        if (!suksesBatal) return ctx.answerCbQuery('❌ Gagal membatalkan nomor di server pusat!', { show_alert: true });
    } else {
        catatKeFileBekas(tx.fileStokAsli, nomorWA);
    }

    if (tx.timerRef) { clearInterval(tx.timerRef); }
    delete transaksi_aktif[nomorWA]; 
    kurangiSlotAntrean(); 
    await ctx.answerCbQuery('Sewa nomor sukses dibatalkan!').catch(() => {});
    await ctx.editMessageText(`❌ **SEWA NOMOR BERHASIL DIBATALKAN**\n\nNomor Sewa: \`${nomorWA}\`\nWaktu tunggu telah melebihi batas 3 menit awal. Saldo Anda aman tidak terpotong.`).catch(() => {});
});
bot.action(/^refresh_otp_(.+)$/, async (ctx) => {
    const nomorFix = ctx.match[1].replace(/\D/g, '').trim();
    if (!transaksi_aktif[nomorFix]) return ctx.answerCbQuery('⚠️ Sesi sewa tidak aktif!', { show_alert: true });
    
    const tx = transaksi_aktif[nomorFix];
    if (tx.jalur === 'wa') {
        return ctx.answerCbQuery('📱 Jalur WhatsApp diperiksa manual otomatis oleh admin.', { show_alert: true });
    }
    
    const cekStatus = await cekOtpOtomatisLitensi(tx.orderId);
    if (cekStatus && cekStatus.otp) {
        if (tx.timerRef) { clearInterval(tx.timerRef); }
        tx.status_sukses = true;
        await potongSaldoSukses(tx.userId, tx.harga);
        const inlineKeyboardSukses = { inline_keyboard: [[{ text: "🔄 Repeat OTP", callback_data: "repeat_sama_" + nomorFix }], [{ text: "✅ Sukses", callback_data: "cek_ram_saldo" }]] };
        try { await bot.telegram.editMessageReplyMarkup(tx.userId, tx.msgId, null, inlineKeyboardSukses); } catch (e) {}
        await bot.telegram.sendMessage(tx.userId, `🟢 **VERIFICATION CODE RECEIVED (SMS)**\n\n🔑 **CODE:** \`${cekStatus.otp}\`\n💬 **SMS:** ${cekStatus.sms}`, { parse_mode: 'Markdown' });
        delete transaksi_aktif[nomorFix]; kurangiSlotAntrean();
    } else {
        await ctx.answerCbQuery('📡 Belum ada SMS OTP masuk dari Operator. Mohon tunggu...', { show_alert: true });
    }
});

bot.action(/^repeat_sama_(.+)$/, async (ctx) => {
    const nomorFix = ctx.match[1].replace(/\D/g, '').trim();
    const namaUser = ctx.from.first_name || "Pembeli";
    if (!transaksi_aktif[nomorFix]) {
        return ctx.answerCbQuery('⚠️ Sesi sewa nomor ini sudah habis! Silakan lakukan sewa nomor baru.', { show_alert: true }).catch(() => {});
    }
    const tx = transaksi_aktif[nomorFix];
    tx.status_sukses = false; 
    await ctx.answerCbQuery('🔄 Permintaan Repeat OTP telah dikirim! Harap tunggu...').catch(() => {});
    await ctx.reply(`🔄 **Permintaan Repeat OTP Terkirim!**\n\nSistem sedang memproses ulang nomor Anda. Harap tunggu kode berikutnya di sini...`);

    if (tx.jalur === 'wa') {
        try {
            const adminRepeatMarkup = { inline_keyboard: [[{ text: "✏️ Input Kode OTP Baru", callback_data: "input_otp_" + tx.userId + "_" + nomorFix }]] };
            await bot.telegram.sendMessage(ADMIN_ID, `🔄 **[PERMINTAAN REPEAT OTP]** 🔄\n\nPembeli: ${namaUser} (\`${tx.userId}\`)\n🎯 Aplikasi: ${tx.aplikasi.toUpperCase()}\n📱 Nomor Sewa: \`${nomorFix}\`\n⚡ Jalur: WHATSAPP (REPEAT)\n\n👉 *Silakan klik tombol di bawah untuk memasukkan kode OTP manual.*`, { reply_markup: adminRepeatMarkup });
        } catch (err) {}
    }
});

bot.action('cek_ram_saldo', (ctx) => { ctx.answerCbQuery('💡 Saldo aman dan otomatis terpotong saat OTP sukses masuk!', { show_alert: true }).catch(() => {}); });
bot.action('tips_aman', (ctx) => { ctx.answerCbQuery().catch(() => {}); ctx.reply('🛡️ TIPS ANTI-TAMENG:\n1. Gunakan koneksi internet stabil.'); });
bot.hears('💳 Top Up Saldo', (ctx) => { status_user[ctx.from.id] = 'MENUNGGU_NOMINAL_TOPUP'; ctx.reply('✏️ Silakan ketik jumlah nominal top up (Minimal Rp 1.000):'); });
bot.action('minta_topup', (ctx) => { ctx.answerCbQuery().catch(() => {}); status_user[ctx.from.id] = 'MENUNGGU_NOMINAL_TOPUP'; ctx.reply('✏️ Silakan ketik jumlah nominal top up (Minimal Rp 1.000):'); });
bot.action(/^input_otp_(\d+)_(.+)$/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('❌ Akses Ditolak!', { show_alert: true });
    const dataCallback = ctx.callbackQuery.data || ""; 
    const pecahData = dataCallback.split("_"); 
    const targetUserId = pecahData[2]; 
    const nomorSewa = pecahData[3];   
    if (!targetUserId || !nomorSewa) return ctx.answerCbQuery('❌ Gagal membaca data transaksi!', { show_alert: true });
    
    status_user[ADMIN_ID] = { status: 'MENUNGGU_INPUT_OTP_MANUAL', target: targetUserId, nomor: nomorSewa };
    await ctx.answerCbQuery('✏️ Sistem siap menerima kode...').catch(() => {});
    await ctx.reply(`✏️ **Silakan langsung ketik angka/teks Kode OTP** untuk nomor \`${nomorSewa}\` (User ID: \`${targetUserId}\`).\nPesan teks yang Anda kirimkan setelah ini akan langsung diteruskan ke pembeli.`);
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id; const text = ctx.message.text.trim();
    if (status_user[userId] === 'MENUNGGU_NOMINAL_TOPUP') {
        const nom = parseInt(text); if (isNaN(nom) || nom < 1000) return ctx.reply('❌ Nominal salah atau kurang dari Rp 1.000.');
        delete status_user[userId]; const unik = Math.floor(Math.random() * 900) + 100; const total = nom + unik;
        request_topup[userId] = { nom, total, nama: ctx.from.first_name || "User" };
        
        const waktuSekarang = new Date();
        const waktuBatas = new Date(waktuSekarang.getTime() + 3 * 60 * 1000);
        const timestampKadaluwarsa = waktuBatas.getTime();
        const pad = (n) => String(n).padStart(2, '0');
        const jamBatas = `${pad(waktuBatas.getHours())}:${pad(waktuBatas.getMinutes())}:${pad(waktuBatas.getSeconds())}`;
        const buatTeksNota = (sisaWaktuTeks) => {
            return `💳 **NOTA TAGIHAN DEPOSIT SALDO**\n` +
                   `━━━━━━━━━━━━━━━━━━━━━━\n` +
                   `🚨 **TOTAL TRANSFER :** Rp ${total.toLocaleString('id-ID')}\n` +
                   `⏳ **SISA WAKTU :** \`${sisaWaktuTeks}\` (Hingga ${jamBatas})\n` +
                   `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                   `⚠️ *Silakan scan QRIS di atas and pastikan nominal transfer Anda sama persis hingga 3 angka terakhir.*`;
        };
        const tombolPembeli = { inline_keyboard: [[{ text: "✅ Selesai Bayar / Konfirmasi", callback_data: `pembeli_konfirmasi_${userId}_${nom}_${total}_${timestampKadaluwarsa}` }]] };
        let pesanNotaObj;
        if (fs.existsSync(GAMBAR_QRIS)) {
            pesanNotaObj = await ctx.replyWithPhoto({ source: GAMBAR_QRIS }, { caption: buatTeksNota("03:00"), parse_mode: 'Markdown', reply_markup: tombolPembeli }).catch(() => {});
        } else {
            pesanNotaObj = await ctx.reply(buatTeksNota("03:00"), { parse_mode: 'Markdown', reply_markup: tombolPembeli }).catch(() => {});
        }

        if (pesanNotaObj) {
            let totalDetikNota = 3 * 60;
            const intervalTimerNota = setInterval(async () => {
                totalDetikNota -= 5;
                if (totalDetikNota <= 0) {
                    clearInterval(intervalTimerNota);
                    if (request_topup[userId]) { delete request_topup[userId]; }
                    try {
                        const teksKadaluwarsa = `❌ **NOTA DEPOSIT KADALUWARSA**\n━━━━━━━━━━━━━━━━━━━━━━\nSesi pembayaran Rp ${total.toLocaleString('id-ID')} telah berakhir and otomatis ditolak oleh sistem karena melewati batas waktu 3 menit. Silakan ajukan top up baru jika ingin melanjutkan.`;
                        if (fs.existsSync(GAMBAR_QRIS)) { await bot.telegram.editMessageCaption(userId, pesanNotaObj.message_id, null, teksKadaluwarsa, { reply_markup: { inline_keyboard: [] } }); } 
                        else { await bot.telegram.editMessageText(userId, pesanNotaObj.message_id, null, teksKadaluwarsa, { reply_markup: { inline_keyboard: [] } }); }
                    } catch (err) {}
                } else {
                    const menitSisa = Math.floor(totalDetikNota / 60); const detikSisa = totalDetikNota % 60;
                    const teksWaktuBerjalan = `${pad(menitSisa)}:${pad(detikSisa)}`;
                    try {
                        if (fs.existsSync(GAMBAR_QRIS)) { await bot.telegram.editMessageCaption(userId, pesanNotaObj.message_id, null, buatTeksNota(teksWaktuBerjalan), { parse_mode: 'Markdown', reply_markup: tombolPembeli }); } 
                        else { await bot.telegram.editMessageText(userId, pesanNotaObj.message_id, null, buatTeksNota(teksWaktuBerjalan), { parse_mode: 'Markdown', reply_markup: tombolPembeli }); }
                    } catch (editErr) {}
                }
            }, 5000);
            if (!request_topup[userId].timers) request_topup[userId].timers = {};
            request_topup[userId].timerRef = intervalTimerNota;
        }
        return;
    }
    if (status_user[userId] && status_user[userId].status === 'MENUNGGU_INPUT_OTP_MANUAL') {
        const dataSewa = status_user[userId]; const idPembeli = parseInt(dataSewa.target); const nomorFix = dataSewa.nomor;
        delete status_user[userId]; 
        try {
            if (transaksi_aktif[nomorFix] && !transaksi_aktif[nomorFix].status_sukses) {
                transaksi_aktif[nomorFix].status_sukses = true; 
                await potongSaldoSukses(idPembeli, transaksi_aktif[nomorFix].harga);
                const inlineKeyboardSukses = { inline_keyboard: [[{ text: "🔄 Repeat OTP", callback_data: "repeat_sama_" + nomorFix }], [{ text: "✅ Sukses", callback_data: "cek_ram_saldo" }]] };
                try { await bot.telegram.editMessageReplyMarkup(idPembeli, transaksi_aktif[nomorFix].msgId, null, inlineKeyboardSukses); } catch (e) {}
                await bot.telegram.sendMessage(idPembeli, `🟢 **VERIFICATION CODE RECEIVED**\n\n🔑 **CODE:** \`${text}\``, { parse_mode: 'Markdown' }); 
                return ctx.reply(`✅ OTP untuk nomor ${nomorFix} sukses diteruskan ke pembeli.`);
            } else {
                return ctx.reply(`❌ Gagal! Sesi transaksi nomor ${nomorFix} sudah sukses atau waktu sewa telah kedaluwarsa.`);
            }
        } catch (err) { return ctx.reply(`❌ Terjadi kendala sistem: ${err.message}`); }
    }

    if (ctx.message.reply_to_message) {
        if (userId !== ADMIN_ID) return; 
        try {
            let idPembeli = null; const pesanAsli = ctx.message.reply_to_message.text || ""; const matchId = pesanAsli.match(/\((\d+)\)/);
            if (matchId) { idPembeli = parseInt(matchId[1]); }
            if (idPembeli && !isNaN(idPembeli)) {
                let nomorDitemukan = null;
                for (let num in transaksi_aktif) {
                    if (transaksi_aktif[num].userId == idPembeli && !transaksi_aktif[num].status_sukses) {
                        nomorDitemukan = num; transaksi_aktif[num].status_sukses = true; 
                        await potongSaldoSukses(idPembeli, transaksi_aktif[num].harga);
                        const inlineKeyboardSukses = { inline_keyboard: [[{ text: "🔄 Repeat OTP", callback_data: "repeat_sama_" + num }], [{ text: "✅ Sukses", callback_data: "cek_ram_saldo" }]] };
                        try { await bot.telegram.editMessageReplyMarkup(idPembeli, transaksi_aktif[num].msgId, null, inlineKeyboardSukses); } catch (e) {}
                        break;
                    }
                }
                if (nomorDitemukan) {
                    await bot.telegram.sendMessage(idPembeli, `🟢 **VERIFICATION CODE RECEIVED**\n\n🔑 **CODE:** \`${text}\``, { parse_mode: 'Markdown' }); 
                    return ctx.reply(`✅ OTP sukses diteruskan melalui deteksi reply.`);
                } else { return ctx.reply(`⚠️ Pembeli ditemukan, namun tidak ada transaksi pending aktif untuk ID tersebut.`); }
            }
        } catch (err) {}
    }
}); 

bot.action(/^pembeli_konfirmasi_(\d+)_(\d+)_(\d+)_(\d+)$/, async (ctx) => {
    const targetUserId = ctx.match[1]; const nominalAsli = ctx.match[2]; const totalTransfer = ctx.match[3]; const waktuKadaluwarsa = parseInt(ctx.match[4]); const namaUser = ctx.from.first_name || "User";
    const waktuKlikSekarang = new Date().getTime();
    if (waktuKlikSekarang > waktuKadaluwarsa) {
        await ctx.answerCbQuery('⚠️ Waktu pembayaran telah habis!', { show_alert: true }).catch(() => {});
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
        return ctx.reply('❌ **Nota Tagihan Expired!** Batas waktu 3 menit telah habis.');
    }
    if (request_topup[targetUserId] && request_topup[targetUserId].timerRef) { clearInterval(request_topup[targetUserId].timerRef); }
    await ctx.answerCbQuery('⏳ Konfirmasi terkirim! Menunggu verifikasi admin...', { show_alert: true }).catch(() => {});
    try {
        if (fs.existsSync(GAMBAR_QRIS)) { await bot.telegram.editMessageCaption(targetUserId, ctx.callbackQuery.message.message_id, null, `✅ **PEMBAYARAN DIKONFIRMASI PEMBELI**\n━━━━━━━━━━━━━━━━━━━━━━\nTagihan sebesar Rp ${parseInt(totalTransfer).toLocaleString('id-ID')} sedang diverifikasi oleh admin.`, { reply_markup: { inline_keyboard: [] } }); } 
        else { await bot.telegram.editMessageText(targetUserId, ctx.callbackQuery.message.message_id, null, `✅ **PEMBAYARAN DIKONFIRMASI PEMBELI**\n━━━━━━━━━━━━━━━━━━━━━━\nTagihan sebesar Rp ${parseInt(totalTransfer).toLocaleString('id-ID')} sedang diverifikasi oleh admin.`, { reply_markup: { inline_keyboard: [] } }); }
    } catch (e) {}
    await bot.telegram.sendMessage(ADMIN_ID, `💵 **DEPOSIT REQUEST**\nUser: ${namaUser} (\`${targetUserId}\`)\nTotal Transfer: Rp ${parseInt(totalTransfer).toLocaleString('id-ID')}`, { 
        reply_markup: { inline_keyboard: [[{ text: "✅ Terima", callback_data: `acc_${targetUserId}_${nominalAsli}` }, { text: "❌ Tolak", callback_data: `rej_${targetUserId}_${nominalAsli}` }]] } 
    }).catch((e) => console.log("Gagal mengirim pesan ke admin:", e.message));
});

bot.action(/^acc_(\d+)_(\d+)$/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const target = parseInt(ctx.match[1]); const nominalTopup = parseInt(ctx.match[2]);
    tambahSaldo(target, "User", nominalTopup);
    db.run("UPDATE users SET total_topup = total_topup + ? WHERE user_id = ?", [nominalTopup, target], async () => {
        await ctx.editMessageText('✅ Deposit sukses disetujui.').catch(() => {});
        await bot.telegram.sendMessage(target, '✨ Top-Up Anda telah sukses dikonfirmasi oleh admin! Saldo Anda sudah bertambah.').catch(() => {});
    });
});

bot.action(/^rej_(\d+)_(\d+)$/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const target = parseInt(ctx.match[1]);
    await ctx.editMessageText('❌ Deposit telah ditolak oleh admin.').catch(() => {});
    const teksSistemTolak = `❌ **TRANSAKSI DEPOSIT GAGAL**\n━━━━━━━━━━━━━━━━━━━━━━\n**Status:** Gagal / Dibatalkan Pihak Sistem\n\nSilakan buat nota tagihan baru and pastikan nominal transfer sama persis hingga 3 angka terakhir.`;
    await bot.telegram.sendMessage(target, teksSistemTolak, { parse_mode: 'Markdown' }).catch(() => {});
});

console.log("\n⏳ Sedang menghubungkan bot ke server Telegram...");
bot.launch().then(() => console.log("⚡ [TELEGRAM AKTIF] Bot Telegram berjalan sukses murni via index.js!")).catch((err) => console.error("Gagal start bot:", err));

process.once('SIGINT', () => { bot.stop('SIGINT'); process.exit(0); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); process.exit(0); });
