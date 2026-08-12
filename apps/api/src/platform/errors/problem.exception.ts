import { HttpException } from '@nestjs/common';

export class ProblemException extends HttpException {
  constructor(
    readonly code: string,
    status: number,
    readonly safeDetail: string
  ) {
    super(safeDetail, status);
  }
}
