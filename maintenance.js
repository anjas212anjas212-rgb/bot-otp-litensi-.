// ==============================================================================
//       SKRIP MANDIRI: BOT PENGGANTI MODE MAINTENANCE (MURNI POPUP ALERT)
// ==============================================================================
const { Telegraf } = require('telegraf');

// Token Bot Utama Anda
const TOKEN = "8929699790:AAFRI2MtOeMgEqRNBWTHwizqr2Q3pPcz7jo"; 
const bot = new Telegraf(TOKEN);

// Teks pengumuman murni untuk di dalam popup alert
const PESAN_POPUP = "⚠️ SERVER KAMI SEDANG MAINTENANCE!\n\nMohon cobalah beberapa saat lagi sampai proses perbaikan selesai.";

// Jika pembeli nekat menekan tombol-tombol inline keyboard dari menu lama
bot.on('callback_query', (ctx) => {
    // 🟢 UTAMA: Memberikan popup alert merah di layar hp pembeli tanpa mengirim chat baru
    ctx.answerCbQuery(PESAN_POPUP, { show_alert: true }).catch(() => {});
});

// Handle ketika ada orang klik /start atau reload bot via teks murni (Tetap dikasih info)
bot.start((ctx) => {
    ctx.reply("⚠️ Server sedang maintenance. Semua tombol menu otomatis dinonaktifkan sementara.").catch(() => {});
});

bot.on('text', (ctx) => {
    ctx.reply("⚠️ Server sedang maintenance. Semua tombol menu otomatis dinonaktifkan sementara.").catch(() => {});
});

console.log("\n=======================================================");
console.log("⚡ [MAINTENANCE ACTIVE] Bot mode perbaikan sukses berjalan!");
console.log("🚨 PENTING: JANGAN TUTUP jendela CMD ini agar bot tetap");
console.log("   bisa menembakkan POPUP alert ke layar HP pembeli.");
console.log("=======================================================");

// Menyalakan server bot pendengar
bot.launch().catch((err) => console.error("Gagal start bot maintenance:", err));

// Pengaman pemutusan server Node.js Windows
process.once('SIGINT', () => { bot.stop('SIGINT'); process.exit(0); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); process.exit(0); });
