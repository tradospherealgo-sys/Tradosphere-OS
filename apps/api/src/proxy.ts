import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

// Task 9.1: apps/api's reverse-proxy layer for the five services that
// already have their own Fastify HTTP surface (auth, market-data,
// education, portfolio, analytics). Decision D20 (EXECUTION_BOOK.md):
// the gateway does not re-implement or re-check auth for these five -- it
// forwards every header (Authorization included) through byte-for-byte and
// lets the downstream service's own requireAuth/RBAC decide, exactly as it
// already does when called directly. This means a caller hitting a public
// route (e.g. GET /v1/education/categories, `security: []` in
// openapi.yaml) with no Authorization header at all works correctly with
// zero gateway-side special-casing -- the proxy has no route-by-route
// knowledge of which of the ~70 proxied paths are public vs protected,
// only the downstream service does.

export interface ProxyTarget {
  // Human-readable name for logging only (e.g. 'auth').
  name: string;
  // The public path prefix Fastify matches on, e.g. '/v1/auth'. Every
  // proxied openapi.yaml path has at least one segment after this prefix
  // (there is no bare /v1/auth or /v1/portfolio route), so `${prefix}/*`
  // covers every real route with one wildcard registration.
  prefix: string;
  // The exact prefix stripped from request.url before forwarding. Equal to
  // `prefix` for auth/market-data/education, whose own app.ts mounts
  // routes root-level (app.post('/signup', ...), not
  // app.post('/auth/signup', ...)). Equal to just '/v1' for
  // portfolio/analytics, whose own app.ts already self-prefixes every
  // route (app.get('/portfolio/positions', ...)) -- stripping the service
  // name too would double-strip and 404 every request. See Decision D20.
  stripPrefix: string;
  // Base URL of the running service, e.g. http://localhost:4001 (local) or
  // http://auth:4001 (docker-compose network) -- resolved from env in
  // index.ts, never hardcoded here.
  baseUrl: string;
}

// Hop-by-hop / connection-management headers that only make sense for the
// literal TCP connection they were set on. content-length is excluded in
// both directions because fetch/Fastify each compute their own from the
// actual bytes being sent -- forwarding a stale value would corrupt the
// message. content-encoding is excluded on the response side because
// undici's fetch transparently decodes standard encodings while still
// reporting the original header on `response.headers`; forwarding it
// verbatim alongside already-decoded bytes would make the client fail to
// decode a second time.
const HOP_BY_HOP_REQUEST_HEADERS = new Set(['host', 'connection', 'content-length', 'transfer-encoding']);
const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  'connection',
  'content-length',
  'transfer-encoding',
  'content-encoding',
  'keep-alive',
]);

async function proxyRequest(target: ProxyTarget, request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // request.url is the raw path+query Fastify received, e.g.
  // '/v1/auth/admin/ping?foo=bar'. Slicing off stripPrefix's fixed length
  // leaves the exact suffix (path remainder + query string, if any) to
  // append to the target's own base URL -- no manual query-string
  // reconstruction needed.
  const forwardUrl = `${target.baseUrl}${request.url.slice(target.stripPrefix.length)}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined || HOP_BY_HOP_REQUEST_HEADERS.has(key.toLowerCase())) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }

  // GET/HEAD must never carry a body (fetch throws if given one). For
  // every other method, request.body is the raw Buffer captured by the
  // wildcard content-type parser registered in registerProxy below -- this
  // proxy forwards bytes verbatim, it never JSON-parses-then-re-serializes
  // a body it isn't itself validating (that's the downstream service's
  // job, same as if the caller had reached it directly).
  const method = request.method.toUpperCase();
  const canHaveBody = method !== 'GET' && method !== 'HEAD';
  const body = canHaveBody && request.body ? (request.body as Buffer) : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(forwardUrl, { method, headers, body });
  } catch (err) {
    // Network-level failure only (connection refused, DNS, timeout) --
    // never a fabricated response. The downstream service being up but
    // itself returning an error status is not this catch block; that
    // response is relayed normally below.
    request.log.error({ err, target: target.name, forwardUrl }, 'proxy target unreachable');
    reply.code(502).send({ error: `upstream service unreachable: ${target.name}` });
    return;
  }

  reply.code(upstream.status);
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) {
      reply.header(key, value);
    }
  });
  const responseBody = Buffer.from(await upstream.arrayBuffer());
  reply.send(responseBody);
}

// Registers one target's wildcard route inside its own encapsulated
// Fastify child context (app.register's callback creates a fresh plugin
// encapsulation scope by default) so the raw-buffer content-type parser
// added here never leaks out and affects the gateway's own in-process
// JSON routes (task 9.2), which still need normal JSON body parsing.
export function registerProxy(app: FastifyInstance, target: ProxyTarget): void {
  app.register(async (scope) => {
    // Fastify's built-in default parsers for application/json and
    // text/plain take priority over a bare '*' wildcard parser even inside
    // an encapsulated child scope -- an exact content-type match always
    // wins over the wildcard fallback, regardless of nesting. Left as-is, a
    // caller sending Content-Type: application/json (the common case) would
    // have Fastify parse the body into a JS object *before* proxyRequest
    // ever runs, and proxyRequest's `request.body as Buffer` cast would
    // then silently pass that object straight to fetch()'s `body` option,
    // which stringifies it to the literal text "[object Object]" -- a real
    // data-corruption bug for every proxied POST/PUT/PATCH with a JSON or
    // text body, not just a test-fixture mismatch. Removing every inherited
    // parser first guarantees the wildcard buffer parser below is the only
    // one active in this scope, so every proxied body is forwarded
    // byte-for-byte regardless of the caller's declared content type.
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => {
      done(null, body);
    });

    scope.all(`${target.prefix}/*`, async (request, reply) => {
      await proxyRequest(target, request, reply);
    });
  });
}
