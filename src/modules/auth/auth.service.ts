import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../users/user.entity';
import { Wallet } from '../wallets/wallet.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private readonly dataSource: DataSource, @InjectRepository(User) private readonly users: Repository<User>, private readonly jwt: JwtService) {}
  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(dto.password, Number(process.env.BCRYPT_ROUNDS ?? 12));
    try {
      const user = await this.dataSource.transaction(async manager => {
        const created = await manager.getRepository(User).save(manager.getRepository(User).create({ email, passwordHash, role: UserRole.USER }));
        await manager.getRepository(Wallet).save(manager.getRepository(Wallet).create({ userId: created.id, balance: '0', currency: 'USD' }));
        return created;
      });
      return this.issueTokens(user);
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('Email is already registered');
      throw error;
    }
  }
  async login(dto: LoginDto) {
    const user = await this.users.createQueryBuilder('user').addSelect('user.passwordHash').where('user.email = :email', { email: dto.email.trim().toLowerCase() }).getOne();
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) throw new UnauthorizedException('Invalid email or password');
    return this.issueTokens(user);
  }
  private async issueTokens(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwt.signAsync(payload, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: process.env.JWT_ACCESS_TTL ?? '15m' });
    const refreshToken = await this.jwt.signAsync({ sub: user.id, type: 'refresh' }, { secret: process.env.JWT_REFRESH_SECRET, expiresIn: process.env.JWT_REFRESH_TTL ?? '7d' });
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.users.update(user.id, { refreshTokenHash });
    return { tokenType: 'Bearer', accessToken, refreshToken, expiresIn: process.env.JWT_ACCESS_TTL ?? '15m', user: { id: user.id, email: user.email, role: user.role } };
  }
  async refresh(token: string) {
    let payload: any;
    try { payload = await this.jwt.verifyAsync(token, { secret: process.env.JWT_REFRESH_SECRET }); } catch { throw new UnauthorizedException('Invalid refresh token'); }
    if (payload.type !== 'refresh') throw new UnauthorizedException('Invalid refresh token');
    const user = await this.users.createQueryBuilder('user').addSelect('user.refreshTokenHash').where('user.id = :id', { id: payload.sub }).getOne();
    if (!user?.refreshTokenHash || !(await bcrypt.compare(token, user.refreshTokenHash))) throw new UnauthorizedException('Refresh token revoked');
    return this.issueTokens(user);
  }
  async logout(userId: string) { await this.users.update(userId, { refreshTokenHash: null }); return { success: true }; }
}
