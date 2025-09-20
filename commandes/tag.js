import config from '../config.cjs';

const tagall = async (m, gss) => {
  try {
    const botNumber = await gss.decodeJid(gss.user.id);
    const prefix = config.PREFIX;
    const cmd = m.body.startsWith(prefix) ? m.body.slice(prefix.length).split(' ')[0].toLowerCase() : '';
    const text = m.body.slice(prefix.length + cmd.length).trim();
    
    const validCommands = ['hidetag', 'tagall', 'tagadmins', 'tagnotadmin'];  // Add hidetag to valid commands
    if (!validCommands.includes(cmd)) return;

    if (!m.isGroup) return m.reply("*тнιѕ ¢σммαη∂ ¢αη σηℓу вє υѕє∂ ιη gяσυρѕ*");

    const groupMetadata = await gss.groupMetadata(m.from);
    const participants = groupMetadata.participants;
    const botAdmin = participants.find(p => p.id === botNumber)?.admin;
    const senderAdmin = participants.find(p => p.id === m.sender)?.admin;
    
    // Check if the bot and sender are admins
    if (!botAdmin) return m.reply("*вσт мυѕт вє αη α∂мιη тσ υѕє тнιѕ ¢σммαη∂*");
    if (!senderAdmin) return m.reply("*уσυ мυѕт вє αη α∂мιη тσ υѕє тнιѕ ¢σммαη∂*");

    // Handle the 'tagall' command
    if (cmd === 'tagall') {
      let message = `乂 *Attention Everyone* 乂\n\n*Message:* ${text || 'no message'}\n\n`;

      for (let participant of participants) {
        message += `❏ @${participant.id.split('@')[0]}\n`;
      }

      await gss.sendMessage(m.from, { text: message, mentions: participants.map(a => a.id) }, { quoted: m });
    }

    // Handle the 'tagadmins' command
    if (cmd === 'tagadmins') {
      const admins = participants.filter(p => p.admin);

      if (admins.length === 0) return m.reply("*No admins found in this group*");

      let message = `乂 *Attention Admins* 乂\n\n*Message:* ${text || 'no message provided for admins.'}\n\n`;

      for (let admin of admins) {
        message += `❏ @${admin.id.split('@')[0]}\n`;
      }

      await gss.sendMessage(m.from, { text: message, mentions: admins.map(a => a.id) }, { quoted: m });
    }

    // Handle the 'tagnotadmin' command
    if (cmd === 'tagnotadmin') {
      const nonAdmins = participants.filter(p => !p.admin);

      if (nonAdmins.length === 0) return m.reply("*All participants are admins in this group*");

      let message = `乂 *Attention Non-Admins* 乂\n\n*Message:* ${text || 'no message provided for non-admins.'}\n\n`;

      for (let nonAdmin of nonAdmins) {
        message += `❏ @${nonAdmin.id.split('@')[0]}\n`;
      }

      await gss.sendMessage(m.from, { text: message, mentions: nonAdmins.map(a => a.id) }, { quoted: m });
    }

    // Handle the 'hidetag' command
    if (cmd === 'hidetag') {
      let message = `${text || 'No message provided.'}\n\n`;

      // Send the message with mentions, but hide them in the text
      await gss.sendMessage(m.from, { text: message, mentions: participants.map(a => a.id) }, { quoted: m });
    }

  } catch (error) {
    console.error('Error:', error);
    await m.reply('яєρℓу α мєѕѕαgє {кєєр υѕιηg ʝσєℓ χ∂ ν тняєє вσт.');
  }
};
// codes by Montana Marlon
export default tagall;
