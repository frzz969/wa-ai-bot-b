// src/guards/restrictions/owner-only.js (CJS). ctx.isOwner adalah boolean.
async function checkOwner(ctx, command) {
  if (!command || !command.ownerOnly) return true;
  if (ctx && ctx.isOwner) return true;
  try {
    await ctx.reply('🔒 Command ini khusus owner bot.');
  } catch {}
  return false;
}

module.exports = { checkOwner };
