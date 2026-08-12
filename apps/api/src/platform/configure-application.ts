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
