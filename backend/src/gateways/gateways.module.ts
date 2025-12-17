import { Module, Global } from '@nestjs/common';
import { BoardGateway } from './board.gateway';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global() // Make it global so we can inject BoardGateway anywhere easily
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
    }),
  ],
  providers: [BoardGateway, WsJwtGuard],
  exports: [BoardGateway],
})
export class GatewaysModule {}
