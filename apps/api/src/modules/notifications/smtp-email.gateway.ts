import { createConnection } from 'node:net';

export interface EmailMessage {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}

export interface SendEmailResult {
  providerMessageId: string;
}

export interface EmailGateway {
  sendEmail(message: EmailMessage): Promise<SendEmailResult>;
}

export class SmtpEmailGateway implements EmailGateway {
  private readonly host: string;
  private readonly port: number;
  private readonly from: string;

  constructor(options: { host?: string; port?: number; from?: string } = {}) {
    this.host = options.host ?? process.env.SMTP_HOST ?? '127.0.0.1';
    this.port = options.port ?? Number(process.env.SMTP_PORT ?? '1025');
    this.from = options.from ?? process.env.SMTP_FROM ?? 'no-reply@baas.local';
  }

  async sendEmail(message: EmailMessage): Promise<SendEmailResult> {
    const fromAddress = message.from ?? this.from;
    const messageId = `<${String(Date.now())}.${Math.random().toString(36).substring(2, 9)}@baas.local>`;

    return new Promise((resolve, reject) => {
      const client = createConnection({ host: this.host, port: this.port });

      client.setEncoding('utf8');
      let step = 0;
      let responseBuffer = '';

      const commands = [
        `HELO baas.local\r\n`,
        `MAIL FROM:<${fromAddress}>\r\n`,
        `RCPT TO:<${message.to}>\r\n`,
        `DATA\r\n`,
        `From: ${fromAddress}\r\nTo: ${message.to}\r\nSubject: ${message.subject}\r\nMessage-ID: ${messageId}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${message.html ?? message.text ?? ''}\r\n.\r\n`,
        `QUIT\r\n`
      ];

      client.on('data', (data) => {
        responseBuffer += data.toString();
        const lines = responseBuffer.split('\r\n');
        const lastLine = lines[lines.length - 2] ?? lines[0] ?? '';

        if (/^[23]\d\d/.test(lastLine)) {
          if (step < commands.length) {
            const nextCmd = commands[step];
            step++;
            if (nextCmd) client.write(nextCmd);
          } else {
            client.end();
            resolve({ providerMessageId: messageId });
          }
        } else if (/^[45]\d\d/.test(lastLine)) {
          client.end();
          reject(new Error(`SMTP_ERROR: ${lastLine}`));
        }
      });

      client.on('error', (err) => {
        reject(err);
      });

      client.setTimeout(5000, () => {
        client.destroy();
        reject(new Error('SMTP_TIMEOUT'));
      });
    });
  }
}
