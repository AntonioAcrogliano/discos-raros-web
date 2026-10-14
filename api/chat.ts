import { handleApi } from '../server/router.js';

export const GET = (req: Request) => handleApi(req);
export const POST = (req: Request) => handleApi(req);
