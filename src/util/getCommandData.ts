import { promises as fsPromises } from "fs"
import path from "path"
import { pathToFileURL } from "url"
import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from "discord.js"
import type { Command } from "../types/index.js"

const __dirname = import.meta.dirname

/**
 * Dynamically loads command data from command files for deployment.
 */
export default async function getCommandData(): Promise<
    RESTPostAPIChatInputApplicationCommandsJSONBody[]
> {
    const commandDataList: RESTPostAPIChatInputApplicationCommandsJSONBody[] = []
    const commandsBasePath = path.join(__dirname, "../commands")
    console.log(`[DeployUtil] Starting command data loading from: ${commandsBasePath}`)

    const loadCommandsRecursive = async (directoryPath: string) => {
        try {
            const entries = await fsPromises.readdir(directoryPath, { withFileTypes: true })
            console.log(`[DeployUtil] Scanning directory: ${directoryPath}`)

            for (const entry of entries) {
                const currentPath = path.join(directoryPath, entry.name)

                if (entry.isDirectory()) {
                    await loadCommandsRecursive(currentPath)
                } else if (entry.isFile() && entry.name.endsWith(".js")) {
                    const fileUrl = pathToFileURL(currentPath)
                    try {
                        const commandModule = (await import(fileUrl.href)) as { default?: Command }
                        const command = commandModule.default

                        if (command && typeof command === "object" && "data" in command) {
                            if (typeof command.data.toJSON === "function") {
                                commandDataList.push(command.data.toJSON())
                                console.log(
                                    `[DeployUtil] Found command data: ${command.data.name} from ${entry.name}`
                                )
                            } else {
                                console.warn(
                                    `[DeployUtil][WARNING] Command at ${currentPath} has a 'data' property, but it does not have a toJSON method.`
                                )
                            }
                        } else {
                            console.warn(
                                `[DeployUtil][WARNING] Command file at ${currentPath} is missing a default export or a 'data' property.`
                            )
                        }
                    } catch (error: unknown) {
                        console.error(
                            `[DeployUtil] Error loading command file ${currentPath}:`,
                            error
                        )
                    }
                }
            }
        } catch (error: unknown) {
            console.error(`[DeployUtil] Error reading directory ${directoryPath}:`, error)
        }
    }

    await loadCommandsRecursive(commandsBasePath)
    console.log(
        `[DeployUtil] Finished loading command data. Total found: ${commandDataList.length}`
    )
    return commandDataList
}
