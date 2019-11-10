'use strict';

const http2 = require('http2');

const HEADER_ORIGIN = 'origin';

async function asyncSome(_array, _test) {
  for (const e of _array) {
    let res = _test(e);
    if (res instanceof Promise) {
      res = await res;
    }

    if (res) {
      return true;
    }
  }

  return false;
}

function buildOriginTest(_config) {
  if (typeof _config === 'string') {
    return o => o === _config;
  } else if (_config instanceof RegExp) {
    return o => _config.test(o);
  } else if (typeof _config === 'function') {
    return _config;
  }

  throw new Error(`Unsupported [${_config}] origin test function`);
}

function buildOriginHandler(_config) {
  if (_config === true) {
    return async s => {
      s.out[http2.constants.HTTP2_HEADER_ACCESS_CONTROL_ALLOW_ORIGIN] = s.in[HEADER_ORIGIN];
      s.out.appendUnique(http2.constants.HTTP2_HEADER_VARY, HEADER_ORIGIN);
    };
  } else if (typeof _config === 'string') {
    return async s => s.out[http2.constants.HTTP2_HEADER_ACCESS_CONTROL_ALLOW_ORIGIN] = _config;
  } else if (Array.isArray(_config)) {
    const tests = _config.map(e => buildOriginTest(e));
    return async s => {
      const origin = s.in[HEADER_ORIGIN];
      if (await asyncSome(tests, t => t(origin))) {
        s.out[http2.constants.HTTP2_HEADER_ACCESS_CONTROL_ALLOW_ORIGIN] = origin;
      } else {
        s.out[http2.constants.HTTP2_HEADER_ACCESS_CONTROL_ALLOW_ORIGIN] = false;
      }

      s.out.appendUnique(http2.constants.HTTP2_HEADER_VARY, HEADER_ORIGIN);
    };
  } else if (_config instanceof RegExp || typeof _config === 'function') {
    return buildOriginHandler([_config]);
  }

  return async () => {};
}

function buildMethodsHandler(_config) {
  if (typeof _config === 'string') {
    return s => s.out[http2.constants.HTTP2_HEADER_ACCESS_CONTROL_ALLOW_METHODS] = _config;
  } else if (Array.isArray(_config)) {
    return s => s.out[http2.constants.HTTP2_HEADER_ACCESS_CONTROL_ALLOW_METHODS] = _config.join(',');
  }

  return s => s.out[http2.constants.HTTP2_HEADER_ACCESS_CONTROL_ALLOW_METHODS]
    = s.in[http2.constants.HTTP2_HEADER_ACCESS_CONTROL_REQUEST_METHOD];
}

function buildAllowedHeadersHandler(_config) {
  if (typeof _config === 'string') {
    return s => s.out[http2.constants.HTTP2_HEADER_ACCESS_CONTROL_ALLOW_HEADERS] = _config;
  } else if (Array.isArray(_config)) {
    return s => s.out[http2.constants.HTTP2_HEADER_ACCESS_CONTROL_ALLOW_HEADERS] = _config.join(',');
  }

  return s => {
    const headers = s.in[http2.constants.HTTP2_HEADER_ACCESS_CONTROL_REQUEST_HEADERS];
    if (headers) {
      s.out[http2.constants.HTTP2_HEADER_ACCESS_CONTROL_ALLOW_HEADERS] = headers;
}
  };
}

function buildExposedHeadersHandler(_config) {
  if (typeof _config === 'string') {
    return s => s.out[http2.constants.HTTP2_HEADER_ACCESS_CONTROL_EXPOSE_HEADERS] = _config;
  } else if (Array.isArray(_config)) {
    return s => s.out[http2.constants.HTTP2_HEADER_ACCESS_CONTROL_EXPOSE_HEADERS] = _config.join(',');
  }

  return () => {};
}

function buildCredentialsHandler(_config) {
  if (_config === true) {
    return s => s.out[http2.constants.HTTP2_HEADER_ACCESS_CONTROL_ALLOW_CREDENTIALS] = true;
  }

  return () => {};
}

function buildMaxAgeHandler(_config) {
  if (Number.isInteger(_config)) {
    return s => s.out[http2.constants.HTTP2_HEADER_ACCESS_CONTROL_MAX_AGE] = _config;
  }

  return () => {};
}

function factory(_router, _config) {
  const config = Object.assign({
    origin: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    allowedHeaders: true,
    exposedHeaders: false,
    credentials: false,
    maxAge: false,
    preflight: true,
    optionsStatus: 204
  }, _config);

  if (config.origin === false) {
    return;
  }

  const originHandler = buildOriginHandler(config.origin);
  const methodsHandler = buildMethodsHandler(config.methods);
  const allowedHeadersHandler = buildAllowedHeadersHandler(config.allowedHeaders);
  const exposedHeadersHandler = buildExposedHeadersHandler(config.exposedHeaders);
  const credentialsHandler = buildCredentialsHandler(config.credentials);
  const maxAgeHandler = buildMaxAgeHandler(config.maxAge);

  _router.use(async _stream => {
    await originHandler(_stream);
    methodsHandler(_stream);
    allowedHeadersHandler(_stream);
    exposedHeadersHandler(_stream);
    credentialsHandler(_stream);
    maxAgeHandler(_stream);
  });

  if (config.preflight) {
    _router.options('*', _stream => {
      _stream.status(config.optionsStatus).empty();
    });
  }
}

module.exports = factory;
