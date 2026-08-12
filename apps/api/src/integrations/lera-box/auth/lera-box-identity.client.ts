export type GatewayPersonType = 'PF' | 'PJ';

export interface GatewayRegistration {
  personType: GatewayPersonType;
  name: string;
  tradingName?: string;
  email: string;
  phone: string;
  document: string;
  zipCode: string;
  address: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface GatewaySession {
  accessToken: string;
  tokenType: string;
  codigoCliente: number;
  chaveLoja: string;
  user: {
    id: string;
    personType: GatewayPersonType;
    name: string;
    tradingName: string;
    email: string;
    document: string;
  };
}

export interface GatewayUserProfile {
  id: string;
  personType: GatewayPersonType;
  name: string;
  tradingName: string;
  email: string;
  phone: string;
  document: string;
  codigoCliente: number;
  chaveLoja: string;
  emailConfirmed: boolean;
  createdAt: string;
}

export class LeraBoxDependencyError extends Error {
  constructor(
    readonly operation: string,
    readonly code: string,
    readonly remoteStatus?: number
  ) {
    super(`${code}: ${operation}`);
    this.name = 'LeraBoxDependencyError';
  }
}

export class LeraBoxTimeoutError extends LeraBoxDependencyError {
  constructor(operation: string) {
    super(operation, 'LERA_BOX_TIMEOUT');
    this.name = 'LeraBoxTimeoutError';
  }
}

type Fetch = typeof fetch;

export class LeraBoxIdentityClient {
  constructor(
    private readonly baseUrl: string,
    private readonly request: Fetch = fetch,
    private readonly timeoutMs = 5_000
  ) {}

  async registerUser(input: GatewayRegistration): Promise<void> {
    await this.send(
      'register-user',
      '/api/users',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input)
      },
      201
    );
  }

  async login(input: { document: string; password: string }): Promise<GatewaySession> {
    const response = await this.send(
      'login',
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input)
      },
      201
    );
    const body = (await response.json()) as Record<string, unknown>;
    const user = this.object(body.user, 'login');
    return {
      accessToken: this.string(body.access_token, 'login'),
      tokenType: this.string(body.token_type, 'login'),
      codigoCliente: this.number(body.codigoCliente, 'login'),
      chaveLoja: this.string(body.chaveLoja, 'login'),
      user: {
        id: this.string(user.id, 'login'),
        personType: this.personType(user.personType, 'login'),
        name: this.string(user.name, 'login'),
        tradingName: this.string(user.tradingName, 'login'),
        email: this.string(user.email, 'login'),
        document: this.string(user.document, 'login')
      }
    };
  }

  async getCurrentUser(accessToken: string): Promise<GatewayUserProfile> {
    const response = await this.send(
      'get-current-user',
      '/api/users/me',
      {
        headers: { authorization: `Bearer ${accessToken}` }
      },
      200
    );
    const body = (await response.json()) as Record<string, unknown>;
    return {
      id: this.string(body.id, 'get-current-user'),
      personType: this.personType(body.personType, 'get-current-user'),
      name: this.string(body.name, 'get-current-user'),
      tradingName: this.string(body.tradingName, 'get-current-user'),
      email: this.string(body.email, 'get-current-user'),
      phone: this.string(body.phone, 'get-current-user'),
      document: this.string(body.document, 'get-current-user'),
      codigoCliente: this.number(body.codigoCliente, 'get-current-user'),
      chaveLoja: this.string(body.chaveLoja, 'get-current-user'),
      emailConfirmed: this.boolean(body.emailConfirmed, 'get-current-user'),
      createdAt: this.string(body.createdAt, 'get-current-user')
    };
  }

  profilesMatch(
    profile: GatewayUserProfile,
    expected: { document: string; personType: GatewayPersonType }
  ): boolean {
    return profile.document === expected.document && profile.personType === expected.personType;
  }

  async send(
    operation: string,
    path: string,
    init: RequestInit,
    expectedStatus: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);
    try {
      const response = await this.request(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal
      });
      if (response.status !== expectedStatus) {
        throw new LeraBoxDependencyError(operation, 'LERA_BOX_CONCLUSIVE_FAILURE', response.status);
      }
      return response;
    } catch (error) {
      if (error instanceof LeraBoxDependencyError) throw error;
      if (controller.signal.aborted) throw new LeraBoxTimeoutError(operation);
      throw new LeraBoxDependencyError(operation, 'LERA_BOX_CONNECTION_FAILED');
    } finally {
      clearTimeout(timeout);
    }
  }

  private string(value: unknown, operation: string): string {
    if (typeof value !== 'string') throw this.malformed(operation);
    return value;
  }

  private number(value: unknown, operation: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw this.malformed(operation);
    return value;
  }

  private boolean(value: unknown, operation: string): boolean {
    if (typeof value !== 'boolean') throw this.malformed(operation);
    return value;
  }

  private object(value: unknown, operation: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw this.malformed(operation);
    return value as Record<string, unknown>;
  }

  private personType(value: unknown, operation: string): GatewayPersonType {
    if (value !== 'PF' && value !== 'PJ') throw this.malformed(operation);
    return value;
  }

  private malformed(operation: string): LeraBoxDependencyError {
    return new LeraBoxDependencyError(operation, 'LERA_BOX_MALFORMED_RESPONSE');
  }
}
