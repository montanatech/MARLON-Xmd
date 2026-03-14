import config from '../config.cjs';

const uptime = async (m, Matrix) => {
  const prefix = config.PREFIX;
  const cmd = m.body?.startsWith(prefix)
    ? m.body.slice(prefix.length).split(" ")[0].toLowerCase()
    : "";

  if (cmd !== "uptime") return;

  const time = process.uptime();
  const h = Math.floor(time / 3600);
  const mnt = Math.floor((time % 3600) / 60);
  const s = Math.floor(time % 60);

  await Matrix.sendMessage(
    m.from,
    { text: `⏱️ Bot Uptime: ${h}h ${mnt}m ${s}s` },
    { quoted: m }
  );
};

export default uptime;
