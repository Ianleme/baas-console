export interface EmailMessage {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export interface SendEmailResult {
  providerMessageId: string;
}

export interface EmailGateway {
  sendEmail(message: EmailMessage): Promise<SendEmailResult>;
}

type BrevoResponse = { messageId?: unknown };

export class BrevoEmailGateway implements EmailGateway {
  private readonly apiKey: string | undefined;
  private readonly senderEmail: string | undefined;
  private readonly senderName: string | undefined;

  constructor(options: { apiKey?: string; senderEmail?: string; senderName?: string } = {}) {
    this.apiKey = options.apiKey ?? process.env.BREVO_API_KEY;
    this.senderEmail = options.senderEmail ?? process.env.BREVO_SENDER_EMAIL;
    this.senderName = options.senderName ?? process.env.BREVO_SENDER_NAME;
  }

  async sendEmail(message: EmailMessage): Promise<SendEmailResult> {
    if (!this.apiKey || !this.senderEmail) {
      throw this.providerError('BREVO_CONFIGURATION_MISSING');
    }

    const body: Record<string, unknown> = {
      sender: this.senderName ? { email: this.senderEmail, name: this.senderName } : { email: this.senderEmail },
      to: [{ email: message.to }],
      subject: message.subject
    };
    if (message.html !== undefined) body.htmlContent = message.html;
    if (message.text !== undefined) body.textContent = message.text;

    let response: Response;
    try {
      response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': this.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch {
      throw this.providerError('BREVO_NETWORK_ERROR');
    }

    if (response.status !== 201) {
      throw this.providerError(`BREVO_HTTP_${response.status}`);
    }

    let result: BrevoResponse;
    try {
      result = (await response.json()) as BrevoResponse;
    } catch {
      throw this.providerError('BREVO_INVALID_RESPONSE');
    }
    if (typeof result.messageId !== 'string' || result.messageId.length === 0) {
      throw this.providerError('BREVO_MESSAGE_ID_MISSING');
    }
    return { providerMessageId: result.messageId };
  }

  private providerError(code: string): Error & { code: string } {
    const error = new Error(code) as Error & { code: string };
    error.code = code;
    return error;
  }
}
