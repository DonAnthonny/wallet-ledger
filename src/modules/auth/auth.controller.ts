import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
@ApiTags('Auth') @Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) { }
  @Post('register') @ApiOperation({ summary: 'Register user and create a zero-balance wallet' }) register(@Body() dto: RegisterDto) { return this.auth.register(dto); }
  @Post('login') @HttpCode(HttpStatus.OK) login(@Body() dto: LoginDto) { return this.auth.login(dto); }
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access and refresh tokens' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refreshToken);
  }
  @Post('logout') @UseGuards(JwtAuthGuard) @ApiBearerAuth() logout(@CurrentUser() user: any) { return this.auth.logout(user.id); }
}
