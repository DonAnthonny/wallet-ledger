
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({
    name: 'email',
    description: 'The email address associated with the user account.',
    example: 'purya@example.com',
    type: String,
    format: 'email',
    required: true,
    minLength: 1,
    maxLength: 254,
  })
  @IsEmail({}, { message: 'Email must be a valid email address.' })
  @IsString({ message: 'Email must be a string.' })
  email: string;

  @ApiProperty({
    name: 'password',
    description: 'The account password. Must contain between 1 and 72 characters.',
    example: 'SecurePassword123!',
    type: String,
    format: 'password',
    required: true,
    minLength: 1,
    maxLength: 72,
    writeOnly: true,
  })
  @IsString({ message: 'Password must be a string.' })
  @MinLength(1, {
    message: 'Password must not be empty.',
  })
  @MaxLength(72, {
    message: 'Password must not exceed 72 characters.',
  })
  password: string;
}
