// src/guards/restrictions/group-only.js (CJS). ctx.isGroup adalah boolean.
async function checkGroup(ctx, command) {
  if (!command || !command.groupOnly) return true;
  if (ctx && ctx.isGroup) return true;
  try {
    await ctx.reply('👥 Command ini hanya bisa dipakai di grup.');
  } catch {}
  return false;
}

module.exports = { checkGroup };
