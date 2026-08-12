import { createBaasClient } from '../src/index.js';

const client = createBaasClient({ baseUrl: 'https://api.example.test' });
void client.GET('/health/live');
void client.GET('/health/ready');
