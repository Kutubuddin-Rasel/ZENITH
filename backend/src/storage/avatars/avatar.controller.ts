import {
  BadRequestException,
  Controller,
  Inject,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';
import { USER_PROFILE_WRITER } from '../../users/constants/user.tokens';
import { IUserProfileWriter } from '../../users/interfaces/user.interfaces';

/**
 * Step 6 — Avatar uploads moved out of `UsersController`. The storage module
 * owns the multer/diskStorage wiring; the user-profile mutation goes through
 * the `IUserProfileWriter` ISP token so this controller has no dependency on
 * the concrete `UsersService`.
 *
 * HTTP contract (`POST /users/me/avatar`) is preserved.
 */
@Controller('users')
export class AvatarController {
  constructor(
    @Inject(USER_PROFILE_WRITER)
    private readonly userWriter: IUserProfileWriter,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads', 'avatars'),
        filename: (_req, file, cb) => {
          const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/^image\/(jpeg|jpg|png)$/)) {
          cb(
            new BadRequestException('Only JPG and PNG files are allowed'),
            false,
          );
        } else {
          cb(null, true);
        }
      },
    }),
  )
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; avatarUrl: string }> {
    const avatarUrl = `/uploads/avatars/${file.filename}`;
    await this.userWriter.update(req.user.userId, { avatarUrl });
    return { success: true, avatarUrl };
  }
}
