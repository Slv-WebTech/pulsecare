// Generates a throwaway self-signed certificate for the fake Cloudinary used by the live tests
// (the Cloudinary SDK only speaks HTTPS). Output: tests/integration/certs/ (git-ignored).
//   node tests/integration/make-cert.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "certs");
fs.mkdirSync(dir, { recursive: true });
const conf = path.join(os.tmpdir(), `pulsecare-openssl-${process.pid}.cnf`);
fs.writeFileSync(
  conf,
  "[req]\ndistinguished_name=dn\nx509_extensions=v3\nprompt=no\n[dn]\nCN=127.0.0.1\n[v3]\nsubjectAltName=IP:127.0.0.1,DNS:localhost\n"
);
try {
  execFileSync(
    "openssl",
    ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "30", "-keyout", path.join(dir, "stub-key.pem"), "-out", path.join(dir, "stub-cert.pem")],
    { env: { ...process.env, OPENSSL_CONF: conf }, stdio: "ignore" }
  );
  console.log("created", path.join(dir, "stub-cert.pem"));
} finally {
  fs.rmSync(conf, { force: true });
}
