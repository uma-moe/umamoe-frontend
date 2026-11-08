import { createRequestPacer } from '../http/request-pacer';

// The API allows each browser 30 writes a minute; pacing race analysis to 25 leaves the rest of the site room.
export const simulatorRequests = createRequestPacer({ limit: 25, windowMs: 60_000 });
