import { BrevoEmailGateway } from '../../src/modules/notifications/brevo-email.gateway.js';

describe('BrevoEmailGateway', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('posts the Brevo payload and returns its message id', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      status: 201,
      json: async () => ({ messageId: '<brevo-message>' })
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(
      new BrevoEmailGateway({
        apiKey: 'secret',
        senderEmail: 'no-reply@example.com',
        senderName: 'BaaS'
      }).sendEmail({
        to: 'customer@example.com',
        subject: 'Welcome',
        html: '<p>Hello</p>',
        text: 'Hello'
      })
    ).resolves.toEqual({ providerMessageId: '<brevo-message>' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.brevo.com/v3/smtp/email',
      expect.objectContaining({
        method: 'POST',
        headers: { 'api-key': 'secret', 'content-type': 'application/json' },
        body: JSON.stringify({
          sender: { email: 'no-reply@example.com', name: 'BaaS' },
          to: [{ email: 'customer@example.com' }],
          subject: 'Welcome',
          htmlContent: '<p>Hello</p>',
          textContent: 'Hello'
        })
      })
    );
  });

  it('fails at send time when credentials are missing and does not expose response bodies', async () => {
    const gateway = new BrevoEmailGateway();
    await expect(gateway.sendEmail({ to: 'a@b.com', subject: 'x' })).rejects.toMatchObject({
      code: 'BREVO_CONFIGURATION_MISSING'
    });
  });

  it('classifies non-201 responses without including provider details', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ status: 401 }) as typeof fetch;
    await expect(
      new BrevoEmailGateway({ apiKey: 'secret', senderEmail: 'a@b.com' }).sendEmail({
        to: 'c@d.com',
        subject: 'x'
      })
    ).rejects.toMatchObject({ code: 'BREVO_HTTP_401', message: 'BREVO_HTTP_401' });
  });
});
