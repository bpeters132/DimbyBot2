import winston from "winston"
import colors from "colors"

class Logger {
  constructor(file) {
    this.logger = winston.createLogger({
      transports: [new winston.transports.File({ filename: file })],
    })
  }

  log(Text, ...args) {
    let d = new Date()
    this.logger.log({
      level: "info",
      message: "info: " + Text + args,
    })
    console.log(
      colors.gray(
        `[${d.getDate()}:${d.getMonth()}:${d.getFullYear()} - ${d.getHours()}:${d.getMinutes()}]`
      ) + colors.green(" | " + Text + args)
    )
  }

  warn(Text, ...args) {
    let d = new Date()
    this.logger.log({
      level: "warn",
      message: "warn: " + Text + args,
    })
    console.log(
      colors.gray(
        `[${d.getDate()}:${d.getMonth()}:${d.getFullYear()} - ${d.getHours()}:${d.getMinutes()}]`
      ) + colors.yellow(" | " + Text + args)
    )
  }

  error(Text, ...args) {
    let d = new Date()
    this.logger.log({
      level: "error",
      message: "error: " + Text + args,
    })
    console.log(
      colors.gray(
        `[${d.getDate()}:${d.getMonth()}:${d.getFullYear()} - ${d.getHours()}:${d.getMinutes()}]`
      ) + colors.red(" | " + Text + ": " + args)
    )
  }

  debug(Text, ...args) {
    let d = new Date()
    this.logger.log({
      level: "debug",
      message: "debug: " + Text + args,
    })
    console.log(
      colors.gray(
        `[${d.getDate()}:${d.getMonth()}:${d.getFullYear()} - ${d.getHours()}:${d.getMinutes()}]`
      ) + colors.magenta(" | " + Text + args)
    )
  }
}

export default Logger
