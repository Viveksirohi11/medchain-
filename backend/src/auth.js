const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { ethers } = require("ethers");

// Temporary Day-1 challenge storage.
// Day 2 will harden this with stronger nonce/session handling.
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

function createChallenge(address) {
  const normalizedAddress =
    normalizeAddress(address);

  const nonce =
    crypto.randomBytes(32).toString("hex");

  const issuedAt = new Date();

  const expiresAt = new Date(
    issuedAt.getTime() + CHALLENGE_TTL_MS
  );

  const message = [
    "MedChain Authentication",
    "",
    `Wallet: ${normalizedAddress}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expiration Time: ${expiresAt.toISOString()}`
  ].join("\n");

  challenges.set(
    normalizedAddress.toLowerCase(),
    {
      nonce,
      message,
      issuedAt: issuedAt.getTime(),
      expiresAt: expiresAt.getTime()
    }
  );

  return {
    address: normalizedAddress,
    message,
    expiresAt: expiresAt.toISOString()
  };
}

function verifyChallenge(
  address,
  message,
  signature
) {
  const normalizedAddress =
    normalizeAddress(address);

  const key =
    normalizedAddress.toLowerCase();

  const challenge =
    challenges.get(key);

  if (!challenge) {
    throw new Error(
      "Authentication challenge not found"
    );
  }

  if (Date.now() > challenge.expiresAt) {
    challenges.delete(key);

    throw new Error(
      "Authentication challenge expired"
    );
  }

  if (message !== challenge.message) {
    throw new Error(
      "Invalid authentication message"
    );
  }

  let recoveredAddress;

  try {
    recoveredAddress =
      ethers.verifyMessage(
        message,
        signature
      );
  } catch {
    throw new Error(
      "Invalid wallet signature"
    );
  }

  if (
    recoveredAddress.toLowerCase() !==
    normalizedAddress.toLowerCase()
  ) {
    throw new Error(
      "Wallet signature does not match address"
    );
  }

  // Challenge can only be used once.
  challenges.delete(key);

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