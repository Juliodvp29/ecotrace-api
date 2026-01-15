import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) { }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerDto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(
    @Body('refreshToken') refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    return this.authService.refreshTokens(refreshToken);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
  }

  @Get('google/callback')
  async googleAuthCallback(@Req() req: Request, @Res() res: Response) {
    console.log('📥 Google callback received');

    const passport = require('passport');

    passport.authenticate('google', { session: false }, async (err: any, user: any) => {
      try {
        if (err) {
          console.error('❌ Passport error:', err.message);
          return res.status(500).json({
            success: false,
            message: 'Authentication failed',
            error: err.message
          });
        }

        if (!user || !user.email) {
          console.error('❌ No user data from Google');
          return res.status(400).json({
            success: false,
            message: 'No user data received from Google'
          });
        }

        console.log('✅ User from Google:', user.email);

        const authResponse = await this.authService.googleAuth(user);

        console.log('✅ Authentication successful');

        const frontendUrl = this.configService.get<string>('FRONTEND_URL');

        if (!frontendUrl || frontendUrl === '' || frontendUrl === 'http://localhost:5173') {
          console.log('📤 Returning JSON (no frontend configured)');
          return res.status(200).json({
            success: true,
            message: '✅ Authentication successful! Save these tokens:',
            ...authResponse,
          });
        }

        console.log('↪️ Redirecting to frontend:', frontendUrl);
        const redirectUrl = `${frontendUrl}/auth/callback?token=${authResponse.accessToken}&refresh=${authResponse.refreshToken}`;
        return res.redirect(redirectUrl);

      } catch (error: any) {
        console.error('❌ Authentication error:', error.message);
        return res.status(500).json({
          success: false,
          message: error.message || 'Authentication failed'
        });
      }
    })(req, res);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async getProfile(@Req() req: any) {
    return {
      user: req.user,
    };
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async logout() {
    return {
      message: 'Logged out successfully',
    };
  }
}