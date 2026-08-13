import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { ProblemDetailsFilter } from './errors/problem-details.filter.js';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const swaggerConfiguration = new DocumentBuilder()
    .setTitle('BaaS Console API')
    .setDescription('Merchant BaaS integration boundary')
    .setVersion('1.0')
    .build();
  return SwaggerModule.createDocument(app, swaggerConfiguration);
}

export function configureApplication(app: INestApplication): void {
  app.use(helmet());
  const corsOptions = {
    credentials: true,
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void
    ) => {
      const allowed = (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:5173')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      callback(
        !origin || allowed.includes(origin) ? null : new Error('CORS_ORIGIN_NOT_ALLOWED'),
        Boolean(origin)
      );
    }
  };
  app.enableCors(corsOptions);
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true
    })
  );
  app.useGlobalFilters(new ProblemDetailsFilter());

  const document = createOpenApiDocument(app);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json'
  });
}
