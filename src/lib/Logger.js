import winston from 'winston';
import colors from 'colors';

class Logger {
    constructor(file) {
        this.logger = winston.createLogger({
            transports: [new winston.transports.File({ filename: file })],
        });
    }

    log(Text) {
        let d = new Date();
        this.logger.log({
            level: 'info',
            message: 'info: ' + Text,
        });
        console.log(
            colors.gray(
                `[${d.getDate()}:${d.getMonth()}:${d.getFullYear()} - ${d.getHours()}:${d.getMinutes()}]`,
            ) + colors.green(' | ' + Text),
        );
    }

    warn(Text) {
        let d = new Date();
        this.logger.log({
            level: 'warn',
            message: 'warn: ' + Text,
        });
        console.log(
            colors.gray(
                `[${d.getDate()}:${d.getMonth()}:${d.getFullYear()} - ${d.getHours()}:${d.getMinutes()}]`,
            ) + colors.yellow(' | ' + Text),
        );
    }

    error(Text, ...args) {
        let d = new Date();
        this.logger.log({
            level: 'error',
            message: 'error: ' + Text,
        });
        console.log(
            colors.gray(
                `[${d.getDate()}:${d.getMonth()}:${d.getFullYear()} - ${d.getHours()}:${d.getMinutes()}]`,
            ) + colors.red(' | ' + Text + ': ' + args),
        );
    }
}

export default Logger;
