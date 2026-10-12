const zlib = require("zlib");

/**
 * Unified Brotli (br) & Gzip Smart Compression Middleware
 * Provides automatic Brotli compression for modern browsers (15-25% higher compression than gzip)
 * and seamless fallback to Gzip for older clients.
 * Bypasses binary download streams (/stream) to avoid redundant CPU usage.
 */
function brotliCompression(req, res, next) {
  // Never compress binary file byte-range MTProto streams
  if (req.path.includes("/stream")) {
    return next();
  }

  const acceptEncoding = req.headers["accept-encoding"] || "";
  let stream = null;
  let encoding = null;

  if (acceptEncoding.includes("br")) {
    stream = zlib.createBrotliCompress({
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 4, // Fast dynamic balance
        [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
      },
    });
    encoding = "br";
  } else if (acceptEncoding.includes("gzip")) {
    stream = zlib.createGzip({ level: 6 });
    encoding = "gzip";
  }

  if (!stream) {
    return next();
  }

  const origWriteHead = res.writeHead.bind(res);
  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);

  let headersWritten = false;

  const injectCompressionHeaders = () => {
    if (!headersWritten && !res.headersSent) {
      res.setHeader("Content-Encoding", encoding);
      res.setHeader("Vary", "Accept-Encoding");
      res.removeHeader("Content-Length");
      headersWritten = true;
    }
  };

  res.writeHead = function (status, reason, headers) {
    injectCompressionHeaders();
    return origWriteHead(status, reason, headers);
  };

  stream.on("data", (chunk) => origWrite(chunk));
  stream.on("end", () => origEnd());

  res.write = (chunk, enc, cb) => {
    injectCompressionHeaders();
    return stream.write(chunk, enc, cb);
  };

  res.end = (chunk, enc, cb) => {
    injectCompressionHeaders();
    if (chunk) stream.write(chunk, enc);
    stream.end(cb);
  };

  next();
}

module.exports = { brotliCompression };

