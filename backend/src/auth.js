const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { ethers } = require("ethers");
const { SiweMessage } = require("siwe");

const challenges = new Map();

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return secret;
}

function normalizeAddress(address) {
  if (!address || !ethers.isAddress(address)) {
    throw new Error("Invalid wallet address");
  }

  return ethers.getAddress(address);
}

function getAuthConfig() {
  const domain =
    process.env.SIWE_DOMAIN || "localhost:5173";

  const uri =
    process.env.SIWE_URI ||
    "http://localhost:5173";

  const chainId =
    Number(process.env.SIWE_CHAIN_ID || "31337");

  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error("Invalid SIWE_CHAIN_ID");
  }

  return {
    domain,
    uri,
    chainId
  };
}

function createChallenge(address) {
  const normalizedAddress =
    normalizeAddress(address);

  const config = getAuthConfig();

  const nonce =
    crypto.randomBytes(16).toString("hex");

  const issuedAt = new Date();

  const expirationTime =
    new Date(
      issuedAt.getTime() + CHALLENGE_TTL_MS
    );

  const message = new SiweMessage({
    domain: config.domain,
    address: normalizedAddress,
    statement: "Sign in to MedChain.",
    uri: config.uri,
    version: "1",
    chainId: config.chainId,
    nonce,
    issuedAt: issuedAt.toISOString(),
    expirationTime:
      expirationTime.toISOString()
  });

  const preparedMessage =
    message.prepareMessage();

  challenges.set(
    nonce,
    {
      address: normalizedAddress,
      message: preparedMessage,
      expiresAt: expirationTime.getTime()
    }
  );

  return {
    address: normalizedAddress,
    message: preparedMessage,
    nonce,
    expiresAt:
      expirationTime.toISOString()
  };
}

async function verifyChallenge(
  address,
  message,
  signature,
  nonce
) {
  const normalizedAddress =
    normalizeAddress(address);

  if (!nonce) {
    throw new Error(
      "Authentication nonce is required"
    );
  }

  const challenge =
    challenges.get(nonce);

  if (!challenge) {
    throw new Error(
      "Authentication challenge not found"
    );
  }

  if (Date.now() > challenge.expiresAt) {
    challenges.delete(nonce);

    throw new Error(
      "Authentication challenge expired"
    );
  }

  if (message !== challenge.message) {
    throw new Error(
      "Invalid authentication message"
    );
  }

  if (
    challenge.address.toLowerCase() !==
    normalizedAddress.toLowerCase()
  ) {
    throw new Error(
      "Authentication address mismatch"
    );
  }

  const config = getAuthConfig();

  let siweMessage;

  try {
    siweMessage =
      new SiweMessage(message);
  } catch {
    throw new Error(
      "Invalid SIWE message"
    );
  }

  if (
    siweMessage.domain !==
    config.domain
  ) {
    throw new Error(
      "Authentication domain mismatch"
    );
  }

  if (
    siweMessage.uri !==
    config.uri
  ) {
    throw new Error(
      "Authentication URI mismatch"
    );
  }

  if (
    Number(siweMessage.chainId) !==
    config.chainId
  ) {
    throw new Error(
      "Wallet is connected to the wrong network"
    );
  }

  if (
    siweMessage.address.toLowerCase() !==
    normalizedAddress.toLowerCase()
  ) {
    throw new Error(
      "Wallet address does not match SIWE message"
    );
  }

  if (siweMessage.nonce !== nonce) {
    throw new Error(
      "Authentication nonce mismatch"
    );
  }

 
let verification;

try {
  verification = await siweMessage.verify({
    signature,
    domain: config.domain,
    nonce,
    time: new Date().toISOString()
  });
} catch {
  throw new Error("Invalid SIWE signature");
}

if (!verification || !verification.success) {
  throw new Error("Invalid SIWE signature");
}

  if (!verification.success) {
    throw new Error(
      "Invalid SIWE signature"
    );
  }

  if (
    verification.data.address.toLowerCase() !==
    normalizedAddress.toLowerCase()
  ) {
    throw new Error(
      "Wallet signature does not match address"
    );
  }

  // One-time challenge consumption.
  challenges.delete(nonce);

  return normalizedAddress;
}

function createToken(address) {
  const normalizedAddress =
    normalizeAddress(address);

  return jwt.sign(
    {
      sub: normalizedAddress,
      wallet: normalizedAddress
    },
    getJwtSecret(),
    {
      expiresIn: "1h",
      issuer: "medchain-api",
      audience: "medchain-client"
    }
  );
}

function verifyToken(token) {
  return jwt.verify(
    token,
    getJwtSecret(),
    {
      issuer: "medchain-api",
      audience: "medchain-client"
    }
  );
}

function requireAuth(req, res, next) {
  try {
    const header =
      req.headers.authorization;

    if (
      !header ||
      !header.startsWith("Bearer ")
    ) {
      return res.status(401).json({
        error: "Authentication required"
      });
    }

    const token =
      header.slice("Bearer ".length);

    const payload =
      verifyToken(token);

    req.auth = {
      address:
        normalizeAddress(payload.sub)
    };

    next();
  } catch {
    return res.status(401).json({
      error:
        "Invalid or expired authentication token"
    });
  }
}

module.exports = {
  createChallenge,
  verifyChallenge,
  createToken,
  verifyToken,
  requireAuth
};