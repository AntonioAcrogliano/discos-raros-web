import { handleApi } from '../server/router.js';

export const GET = (req: Request) => handleApi(req);
export const DELETE = (req: Request) => handleApi(req);
