export const T = String(Math.floor(Date.now() / 1000));

export { LOG, ERROR, LOG_TIME, LOG_TIME_END } from './logger.mjs';
export { getContent } from './http.mjs';
export { parallelHandle, pLimit } from './concurrency.mjs';
export {
  filterNonCJK,
  mainHandle,
  postHandle,
  contentHandle,
} from './textProcessor.mjs';
export { NovelGrabber } from './NovelGrabber.mjs';
