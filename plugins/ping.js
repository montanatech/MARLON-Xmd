import config from '../config.cjs';

const ping = async (m, Matrix) => {
  const prefix = config.PREFIX;
  const cmd = m.body?.startsWith(prefix)
    ? m.body.slice(prefix.length).split(" ")[0].toLowerCase()
    : "";

  if (cmd !== "ping") return;

  const start = Date.now();
  await m.React("⚡");

  const msg = await Matrix.sendMessage(m.from, { text: "🏓 Testing ping..." }, { quoted: m });

  const ping = ((Date.now() - start) / 1000).toFixed(3);

  await Matrix.sendMessage(m.from, {
    text: `🏓 *PONG*\n\n⚡ Speed: ${ping}ms`,
    edit: msg.key
  });
};

export default ping;
