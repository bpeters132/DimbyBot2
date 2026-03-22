import fs from "node:fs"
import path from "node:path"

const root = path.join(import.meta.dirname, "..")
const musicDir = path.join(root, "src", "commands", "music")

// Whitespace-tolerant: files may use different blank lines or indentation.
const block =
  /const\s+guild\s*=\s*interaction\.guild\s+[\s\S]*?const\s+member\s*=\s*interaction\.member\s+[\s\S]*?\/\/\s*Check if user is in a voice channel\s+[\s\S]*?const\s+voiceChannel\s*=\s*member\.voice\.channel/s

const block2 =
  /const\s+guild\s*=\s*interaction\.guild\s+[\s\S]*?const\s+member\s*=\s*interaction\.member\s+[\s\S]*?const\s+voiceChannel\s*=\s*member\.voice\.channel/s

const replacement = `const guild = interaction.guild
    if (!guild) {
      return interaction.reply({ content: "Use this command in a server." })
    }
    const member = guildMemberFromInteraction(interaction)
    if (!member) {
      return interaction.reply({ content: "Could not resolve your member profile. Try again." })
    }

    // Check if user is in a voice channel
    const voiceChannel = member.voice.channel`

for (const name of fs.readdirSync(musicDir)) {
  if (!name.endsWith(".ts")) continue
  const file = path.join(musicDir, name)
  let s = fs.readFileSync(file, "utf8")
  if (!s.includes("member.voice.channel")) continue
  if (s.includes("guildMemberFromInteraction")) continue

  const insertImport = () => {
    s = s.replace(
      /import\s+type\s+\{\s*ChatInputCommandInteraction\s*\}\s+from\s+["']discord\.js["']\s*\r?\n/,
      'import type { ChatInputCommandInteraction } from "discord.js"\nimport { guildMemberFromInteraction } from "../../util/guildMember.js"\n'
    )
  }
  insertImport()
  if (block.test(s)) s = s.replace(block, replacement)
  else if (block2.test(s))
    s = s.replace(block2, replacement.replace(/\s*\/\/\s*Check if user is in a voice channel\s+/, ""))
  else {
    console.warn("no match", file)
    continue
  }
  fs.writeFileSync(file, s)
  console.log("patched", name)
}
