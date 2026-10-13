import { plainToInstance } from 'class-transformer';
import { IsInt, IsString, Min, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsString() NODE_ENV: string;
  @IsInt() @Min(1) PORT: number;
  @IsString() DATABASE_HOST: string;
  @IsInt() @Min(1) DATABASE_PORT: number;
  @IsString() DATABASE_USER: string;
  @IsString() DATABASE_PASSWORD: string;
  @IsString() DATABASE_NAME: string;
  @IsString() JWT_ACCESS_SECRET: string;
  @IsString() JWT_REFRESH_SECRET: string;
}

export function validateEnvironment(config: Record<string, unknown>) {
  const values = plainToInstance(EnvironmentVariables, {
    ...config,
    PORT: Number(config.PORT ?? 3000),
    DATABASE_PORT: Number(config.DATABASE_PORT ?? 5432),
  });
  const errors = validateSync(values, { skipMissingProperties: false });
  if (errors.length) throw new Error(`Invalid environment configuration: ${errors.map(e => e.property).join(', ')}`);
  return values;
}
