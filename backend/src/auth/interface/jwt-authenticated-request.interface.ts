import { Request } from 'express';
import { JwtRequestUser } from '../types/jwt-request-user.interface';

export interface JwtAuthenticatedRequest extends Request {
  user: JwtRequestUser;
}
