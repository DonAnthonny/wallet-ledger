
import { ApiProperty } from '@nestjs/swagger';
import { IsJWT } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token received from login or register',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.signature',
  })
  @IsJWT()
  refreshToken!: string;
}
