const ANSI_RESET = '\x1b[0m';
const ANSI_CYAN = '\x1b[36m';
const ANSI_GRAY = '\x1b[90m';
const ANSI_RED = '\x1b[31m';

function formatTerminalMessage(
  tag: string,
  action: string,
  metadata?: Record<string, unknown>
): string {
  const time = new Date().toISOString().substring(11, 23);
  const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : '';
  return `${ANSI_CYAN}[${tag}]${ANSI_RESET} ${ANSI_GRAY}${time}${ANSI_RESET} - ${action}${metaStr}\n`;
}

export const remoteLog = {
  server(action: string, metadata?: Record<string, unknown>): void {
    if (typeof process !== 'undefined' && process.stdout?.write) {
      process.stdout.write(formatTerminalMessage('REMOTE:SERVER', action, metadata));
    } else {
      console.log(`[REMOTE:SERVER] ${action}`, metadata ?? '');
    }
  },

  client(action: string, metadata?: Record<string, unknown>): void {
    if (typeof window === 'undefined') {
      this.server(action, metadata);
      return;
    }

    const badgeStyle =
      'background: #0891b2; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-weight: bold;';
    if (metadata !== undefined) {
      console.log(`%cREMOTE:CLIENT%c ${action}`, badgeStyle, '', metadata);
    } else {
      console.log(`%cREMOTE:CLIENT%c ${action}`, badgeStyle, '');
    }
  },

  error(action: string, error: unknown): void {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (typeof process !== 'undefined' && process.stdout?.write) {
      process.stdout.write(`${ANSI_RED}[REMOTE:ERROR]${ANSI_RESET} ${action}: ${errorMsg}\n`);
    } else {
      console.error(
        `%cREMOTE:ERROR%c ${action}`,
        'background: #dc2626; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
        '',
        error
      );
    }
  },
};
