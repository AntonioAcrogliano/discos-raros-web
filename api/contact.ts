import { handleApi } from '../server/router.js';

export const POST = (req: Request) => handleApi(req);
