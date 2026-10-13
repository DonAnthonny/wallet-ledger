import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { User } from '../users/user.entity';
import { Wallet } from '../wallets/wallet.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
@Module({ imports: [TypeOrmModule.forFeature([User, Wallet]), PassportModule, JwtModule.register({})], controllers: [AuthController], providers: [AuthService, JwtStrategy], exports: [AuthService] })
export class AuthModule {}
