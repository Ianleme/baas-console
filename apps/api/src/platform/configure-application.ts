import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { ProblemDetailsFilter } from './errors/problem-details.filter.js';

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

  const swaggerConfiguration = new DocumentBuilder()
    .setTitle('BaaS Console API')
    .setDescription('Merchant BaaS integration boundary')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfiguration);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json'
  });
}
