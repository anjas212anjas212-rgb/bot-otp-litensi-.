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
                return ctx.reply(`✅ Sukses mengirim OTP manual.`);
            }
        } catch (e) {}
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
    const targetUserId = parseInt(ctx.match[1]); const nominalAsli = parseInt(ctx.match[2]); const totalTransfer = parseInt(ctx.match[3]); const waktuKadaluwarsa = parseInt(ctx.match[4]); const namaUser = ctx.from.first_name || "User";
    const waktuKlikSekarang = new Date().getTime();
    if (waktuKlikSekarang > waktuKadaluwarsa) {
        await ctx.answerCbQuery('⚠️ Waktu pembayaran telah habis!', { show_alert: true }).catch(() => {});
        return ctx.reply('❌ **Nota Tagihan Expired!** Batas waktu 3 menit telah habis.');
    }
    if (request_topup[targetUserId] && request_topup[targetUserId].timerRef) { clearInterval(request_topup[targetUserId].timerRef); }
    await ctx.answerCbQuery('⏳ Konfirmasi terkirim! Menunggu verifikasi admin...', { show_alert: true }).catch(() => {});
    try {
        if (fs.existsSync(GAMBAR_QRIS)) { await bot.telegram.editMessageCaption(targetUserId, ctx.callbackQuery.message.message_id, null, `✅ **PEMBAYARAN DIKONFIRMASI PEMBELI**\n━━━━━━━━━━━━━━━━━━━━━━\nTagihan sebesar Rp ${totalTransfer.toLocaleString('id-ID')} sedang diverifikasi oleh admin.`, { reply_markup: { inline_keyboard: [] } }); } 
        else { await bot.telegram.editMessageText(targetUserId, ctx.callbackQuery.message.message_id, null, `✅ **PEMBAYARAN DIKONFIRMASI PEMBELI**\n━━━━━━━━━━━━━━━━━━━━━━\nTagihan sebesar Rp ${totalTransfer.toLocaleString('id-ID')} sedang diverifikasi oleh admin.`, { reply_markup: { inline_keyboard: [] } }); }
    } catch (e) {}
    await bot.telegram.sendMessage(ADMIN_ID, `💵 **DEPOSIT REQUEST**\nUser: ${namaUser} (\`${targetUserId}\`)\nTotal Transfer: Rp ${totalTransfer.toLocaleString('id-ID')}`, { 
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
