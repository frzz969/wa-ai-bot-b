// src/guards/restrictions/admin-only.js (CJS).
// ctx: { isGroup (bool), isOwner (bool), isAdmin (bool) }.
// Owner lolos otomatis. Resolusi admin dilakukan saat ctx dibangun (router),
// guard ini hanya membaca flag agar tetap murni & mudah dites.
async function checkAdmin(ctx, command) {
  if (!command || !command.adminOnly) return true;
  if (!ctx || !ctx.isGroup) {
    try {
      await ctx.reply('👥 Command ini hanya bisa dipakai di grup.');
    } catch {}
    return false;
  }
  if (ctx.isOwner) return true;
  if (ctx.isAdmin) return true;
  try {
    await ctx.reply('🛡️ Command ini khusus admin grup.');
  } catch {}
  return false;
}

module.exports = { checkAdmin };
