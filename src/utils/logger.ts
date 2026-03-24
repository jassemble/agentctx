const grey = (s: string) => `\x1b[90m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

export const logger = {
  info(msg: string): void {
    console.log(`${grey('ℹ')} ${msg}`);
  },
  success(msg: string): void {
    console.log(`${green('✔')} ${msg}`);
  },
  warn(msg: string): void {
    console.log(`${yellow('⚠')} ${msg}`);
  },
  error(msg: string): void {
    console.error(`${red('✖')} ${msg}`);
  },
  dim(msg: string): void {
    console.log(dim(msg));
  },
};
