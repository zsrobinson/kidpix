export const stampFetchHeader = 'x-kidpix-validation-fetch';

// WebKit's message alone cannot distinguish cleanup from a failed load.
// A test-only fetch identity proves that this exact request's signal aborted.
export function unexpectedStampRequests(failures, abortedFetches) {
  const aborted = new Set(abortedFetches);
  return failures.filter(({error, fetchId}) => error !== 'net::ERR_ABORTED'
    && !(error === 'Load request cancelled' && fetchId && aborted.has(fetchId)))
    .map(({error, url}) => `${error} ${url}`);
}
