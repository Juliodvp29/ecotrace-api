import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Pool } from 'pg';
import { PG_CONNECTION } from '../database/database.module';
import { AuthResponseDto } from './dto/auth-response.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PG_CONNECTION) private readonly pool: Pool,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) { }

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const { email, password, fullName } = registerDto;

    const existingUser = await this.findUserByEmail(email);
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, full_name, auth_provider, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, full_name, role, avatar_url, auth_provider, created_at`,
        [email, passwordHash, fullName, 'email', 'user'],
      );

      await client.query('COMMIT');

      const user = userResult.rows[0];

      const tokens = await this.generateTokens(user);

      await this.updateLastLogin(user.id);

      return {
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          avatarUrl: user.avatar_url,
          authProvider: user.auth_provider,
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }


  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { email, password } = loginDto;

    const user = await this.findUserByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.password_hash) {
      throw new BadRequestException(
        `This email is registered with ${user.auth_provider}. Please use ${user.auth_provider} to sign in.`,
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.is_active) {
      throw new UnauthorizedException('Account is disabled');
    }

    const tokens = await this.generateTokens(user);

    await this.updateLastLogin(user.id);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        avatarUrl: user.avatar_url,
        authProvider: user.auth_provider,
      },
    };
  }


  async googleAuth(googleAuthDto: GoogleAuthDto): Promise<AuthResponseDto> {
    const { googleId, email, fullName, avatarUrl } = googleAuthDto;

    console.log('🔵 Starting Google Auth for:', email);

    try {
      let user = await this.findUserByGoogleId(googleId);
      console.log('🔍 User found by Google ID:', user ? 'Yes' : 'No');

      if (!user) {
        user = await this.findUserByEmail(email);
        console.log('🔍 User found by email:', user ? 'Yes' : 'No');

        if (user) {
          if (user.password_hash) {
            throw new ConflictException(
              'Email already registered with password. Please login with your password first, then link your Google account in settings.',
            );
          }

          console.log('🔗 Linking Google account to existing user');

          const updateResult = await this.pool.query(
            `UPDATE users 
             SET google_id = $1, auth_provider = $2, avatar_url = COALESCE(avatar_url, $3), updated_at = NOW()
             WHERE id = $4
             RETURNING id, email, full_name, role, avatar_url, auth_provider`,
            [googleId, 'google', avatarUrl, user.id],
          );

          user = updateResult.rows[0];
        } else {
          console.log('➕ Creating new user with Google');

          const result = await this.pool.query(
            `INSERT INTO users (email, google_id, full_name, auth_provider, role, avatar_url, is_email_verified, email_verified_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             RETURNING id, email, full_name, role, avatar_url, auth_provider`,
            [email, googleId, fullName, 'google', 'user', avatarUrl, true],
          );

          user = result.rows[0];
          console.log('✅ New user created:', user.id);
        }
      } else {
        console.log('✅ User already exists with Google ID');
      }

      console.log('🔑 Generating tokens for user:', user.id);
      const tokens = await this.generateTokens(user);

      await this.updateLastLogin(user.id);
      console.log('✅ Last login updated');

      const response = {
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          avatarUrl: user.avatar_url,
          authProvider: user.auth_provider,
        },
      };

      console.log('✅ Google Auth successful for:', email);
      return response;
    } catch (error) {
      console.error('❌ Error in googleAuth:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        code: error.code,
      });
      throw error;
    }
  }

  private async findUserByEmail(email: string): Promise<any> {
    const result = await this.pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email],
    );
    return result.rows[0];
  }

  private async findUserByGoogleId(googleId: string): Promise<any> {
    const result = await this.pool.query(
      'SELECT * FROM users WHERE google_id = $1',
      [googleId],
    );
    return result.rows[0];
  }

  private async updateLastLogin(userId: string): Promise<void> {
    await this.pool.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [userId],
    );
  }

  private async generateTokens(user: any): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_SECRET'),
        expiresIn: this.configService.get('JWT_EXPIRATION'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION'),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  async validateUser(userId: string): Promise<any> {
    const result = await this.pool.query(
      'SELECT id, email, full_name, role, avatar_url, auth_provider FROM users WHERE id = $1 AND is_active = true',
      [userId],
    );
    return result.rows[0];
  }

  async refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      const user = await this.validateUser(payload.sub);
      if (!user) {
        throw new UnauthorizedException('Invalid token');
      }

      return this.generateTokens(user);
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}