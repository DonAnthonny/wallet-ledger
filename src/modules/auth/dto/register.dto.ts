import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' }) @IsEmail() @MaxLength(320) email: string;
  @ApiProperty({ minLength: 10, description: 'At least one lowercase, uppercase, number and special character' })
  @IsString() @MinLength(10) @MaxLength(72) @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/, { message: 'Password must include lowercase, uppercase, number and special character' }) password: string;
}
