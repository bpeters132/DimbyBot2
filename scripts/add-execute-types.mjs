import fs from "node:fs"
import path from "node:path"

const root = path.join(import.meta.dirname, "..")
const commandsDir = path.join(root, "src", "commands")

function walk(d, out = []) {
    for (const name of fs.readdirSync(d)) {
        const p = path.join(d, name)
        if (fs.statSync(p).isDirectory()) walk(p, out)
        else if (name.endsWith(".ts") && !name.includes("disabled")) out.push(p)
    }
    return out
}

for (const file of walk(commandsDir)) {
    let s = fs.readFileSync(file, "utf8")
    if (!/\basync execute\(interaction, client\)/.test(s)) continue

    if (!s.includes("ChatInputCommandInteraction")) {
        const m = s.match(/import [\s\S]*? from "discord\.js"/)
        if (m) {
            s = s.replace(
                m[0],
                `${m[0]}\nimport type { ChatInputCommandInteraction } from "discord.js"`
            )
        }
    }
    if (!s.includes('import type BotClient from "../../lib/BotClient.js"')) {
        const first = s.match(/^import .+$/m)
        if (first) {
            const idx = s.indexOf(first[0]) + first[0].length
            s =
                s.slice(0, idx) +
                '\nimport type BotClient from "../../lib/BotClient.js"' +
                s.slice(idx)
        }
    }
    s = s.replace(
        /(\s*)async execute\(interaction, client\)/g,
        "$1async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown>"
    )
    fs.writeFileSync(file, s)
    console.log(file)
}
