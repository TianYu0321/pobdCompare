/**
 * 彩色日志工具
 */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

export const logger = {
  info: (msg: string) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}[WARN]${colors.reset} ${msg}`),
  error: (msg: string) => console.error(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}[OK]${colors.reset} ${msg}`),
  debug: (msg: string) => console.log(`${colors.gray}[DEBUG]${colors.reset} ${msg}`),
  title: (msg: string) => console.log(`\n${colors.bright}${colors.cyan}▸ ${msg}${colors.reset}`),
  result: (label: string, value: string) => console.log(`  ${colors.cyan}${label}:${colors.reset} ${colors.bright}${value}${colors.reset}`),
  divider: () => console.log(`${colors.gray}${'-'.repeat(60)}${colors.reset}`),
};
