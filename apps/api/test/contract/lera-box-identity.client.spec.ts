import { LeraBoxStub } from '@baas/test-support';

import {
  LeraBoxDependencyError,
  LeraBoxIdentityClient,
  LeraBoxTimeoutError,
  type GatewayRegistration
} from '../../src/integrations/lera-box/auth/lera-box-identity.client.js';

const registration: GatewayRegistration = {
  personType: 'PF',
  name: 'Cliente Sandbox',
  tradingName: 'Loja Sandbox',
  email: 'fixture@example.invalid',
  phone: 'masked-phone',
  document: 'masked-document',
  zipCode: 'masked-postal-code',
  address: 'Endereco Sandbox',
  number: '100',
  complement: 'Teste',
  neighborhood: 'Centro',
  city: 'Sao Paulo',
  state: 'SP'
};

describe('LeraBoxIdentityClient contract', () => {
  it('serializes every PF registration field exactly', async () => {
    let captured: RequestInit | undefined;
    const request: typeof fetch = (_input, init) => {
      captured = init;
      return Promise.resolve(new Response(null, { status: 201 }));
    };
    await new LeraBoxIdentityClient('https://gateway.invalid', request).registerUser(registration);
    expect(typeof captured?.body).toBe('string');
    expect(JSON.parse(captured?.body as string)).toEqual(registration);
  });

  it('serializes PJ registration without changing its person type', async () => {
    let captured: RequestInit | undefined;
    const request: typeof fetch = (_input, init) => {
      captured = init;
      return Promise.resolve(new Response(null, { status: 201 }));
    };
    await new LeraBoxIdentityClient('https://gateway.invalid', request).registerUser({
      ...registration,
      personType: 'PJ'
    });
    expect(typeof captured?.body).toBe('string');
    expect(JSON.parse(captured?.body as string)).toMatchObject({
      personType: 'PJ'
    });
  });

  it('accepts only the observed registration status', async () => {
    const request = jest.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    await expect(
      new LeraBoxIdentityClient('https://gateway.invalid', request).registerUser(registration)
    ).rejects.toMatchObject({ code: 'LERA_BOX_CONCLUSIVE_FAILURE', remoteStatus: 200 });
  });

  it('serializes only document and password during login', async () => {
    const stub = new LeraBoxStub({
      expectedRequests: [
        {
          method: 'POST',
          path: '/api/auth/login',
          body: { document: 'masked-document', password: 'one-time-password' }
        }
      ]
    });
    await stub.start();
    try {
      await new LeraBoxIdentityClient(stub.baseUrl).login({
        document: 'masked-document',
        password: 'one-time-password'
      });
      expect(() => {
        stub.assertSatisfied();
      }).not.toThrow();
    } finally {
      await stub.stop();
    }
  });

  it('maps the observed login response', async () => {
    const stub = new LeraBoxStub();
    await stub.start();
    try {
      const session = await new LeraBoxIdentityClient(stub.baseUrl).login({
        document: 'masked',
        password: 'masked'
      });
      expect(session).toMatchObject({
        accessToken: 'fixture-access-token',
        tokenType: 'Bearer',
        codigoCliente: 100001,
        chaveLoja: 'fixture-store-key'
      });
    } finally {
      await stub.stop();
    }
  });

  it('rejects malformed login responses with a safe error', async () => {
    const request = jest.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 201 }));
    await expect(
      new LeraBoxIdentityClient('https://gateway.invalid', request).login({
        document: 'secret-doc',
        password: 'secret-password'
      })
    ).rejects.toMatchObject({ code: 'LERA_BOX_MALFORMED_RESPONSE' });
  });

  it('does not include login credentials in conclusive errors', async () => {
    const request = jest
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('secret-password', { status: 401 }));
    const promise = new LeraBoxIdentityClient('https://gateway.invalid', request).login({
      document: 'secret-doc',
      password: 'secret-password'
    });
    await expect(promise).rejects.not.toThrow(/secret-password|secret-doc/u);
  });

  it('sends the Bearer token only in the authorization header', async () => {
    let captured: RequestInit | undefined;
    const request: typeof fetch = (_input, init) => {
      captured = init;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: 'id',
            personType: 'PF',
            name: 'n',
            tradingName: 't',
            email: 'e',
            phone: 'p',
            document: 'd',
            codigoCliente: 1,
            chaveLoja: 'k',
            emailConfirmed: true,
            createdAt: 'date'
          }),
          { status: 200 }
        )
      );
    };
    await new LeraBoxIdentityClient('https://gateway.invalid', request).getCurrentUser(
      'secret-token'
    );
    expect(captured?.headers).toEqual({ authorization: 'Bearer secret-token' });
  });

  it('maps the observed current-user profile', async () => {
    const stub = new LeraBoxStub();
    await stub.start();
    try {
      const profile = await new LeraBoxIdentityClient(stub.baseUrl).getCurrentUser('fixture-token');
      expect(profile).toMatchObject({
        id: 'fixture-user-id',
        personType: 'PF',
        emailConfirmed: true
      });
    } finally {
      await stub.stop();
    }
  });

  it('detects a matching profile', () => {
    const client = new LeraBoxIdentityClient('https://gateway.invalid');
    expect(
      client.profilesMatch(
        {
          id: 'id',
          personType: 'PF',
          name: 'n',
          tradingName: 't',
          email: 'e',
          phone: 'p',
          document: 'doc',
          codigoCliente: 1,
          chaveLoja: 'k',
          emailConfirmed: true,
          createdAt: 'date'
        },
        { document: 'doc', personType: 'PF' }
      )
    ).toBe(true);
  });

  it('detects a profile document mismatch', () => {
    const client = new LeraBoxIdentityClient('https://gateway.invalid');
    expect(
      client.profilesMatch(
        {
          id: 'id',
          personType: 'PF',
          name: 'n',
          tradingName: 't',
          email: 'e',
          phone: 'p',
          document: 'other',
          codigoCliente: 1,
          chaveLoja: 'k',
          emailConfirmed: true,
          createdAt: 'date'
        },
        { document: 'doc', personType: 'PF' }
      )
    ).toBe(false);
  });

  it('detects a profile person-type mismatch', () => {
    const client = new LeraBoxIdentityClient('https://gateway.invalid');
    expect(
      client.profilesMatch(
        {
          id: 'id',
          personType: 'PJ',
          name: 'n',
          tradingName: 't',
          email: 'e',
          phone: 'p',
          document: 'doc',
          codigoCliente: 1,
          chaveLoja: 'k',
          emailConfirmed: true,
          createdAt: 'date'
        },
        { document: 'doc', personType: 'PF' }
      )
    ).toBe(false);
  });

  it('maps caller timeout separately from conclusive failure', async () => {
    const stub = new LeraBoxStub({ timeoutDelayMs: 100 });
    await stub.start();
    try {
      const promise = new LeraBoxIdentityClient(
        stub.baseUrl,
        (url, init) =>
          fetch(url, {
            ...init,
            headers: {
              ...Object.fromEntries(new Headers(init?.headers).entries()),
              'x-lera-box-scenario': 'timeout'
            }
          }),
        10
      ).getCurrentUser('token');
      await expect(promise).rejects.toBeInstanceOf(LeraBoxTimeoutError);
    } finally {
      await stub.stop();
    }
  });

  it('maps a disconnected socket without exposing the token', async () => {
    const stub = new LeraBoxStub();
    await stub.start();
    try {
      const promise = new LeraBoxIdentityClient(stub.baseUrl, (url, init) =>
        fetch(url, {
          ...init,
          headers: {
            ...Object.fromEntries(new Headers(init?.headers).entries()),
            'x-lera-box-scenario': 'disconnect'
          }
        })
      ).getCurrentUser('secret-token');
      await expect(promise).rejects.toEqual(
        new LeraBoxDependencyError('get-current-user', 'LERA_BOX_CONNECTION_FAILED')
      );
    } finally {
      await stub.stop();
    }
  });
});
