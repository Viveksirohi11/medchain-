
const test = require("node:test");
const assert = require("node:assert/strict");
const { ethers } = require("ethers");

const {
  createChallenge,
  verifyChallenge,
} = require("../src/auth");


test("rejects an invalid SIWE signature", async () => {
  const wallet = ethers.Wallet.createRandom();
  const attacker = ethers.Wallet.createRandom();
  const challenge = createChallenge(wallet.address);

  const signature = await attacker.signMessage(challenge.message);

  await assert.rejects(
    verifyChallenge(
      wallet.address,
      challenge.message,
      signature,
      challenge.nonce
    ),
    /Invalid SIWE signature/i
  );
});


test("rejects a different wallet address", async () => {
  const walletA = ethers.Wallet.createRandom();
  const walletB = ethers.Wallet.createRandom();

  const challenge = createChallenge(walletA.address);
  const signature = await walletA.signMessage(challenge.message);

  await assert.rejects(
    verifyChallenge(
      walletB.address,
      challenge.message,
      signature,
      challenge.nonce
    ),
    /Authentication address mismatch/i
  );
});

test("rejects a tampered SIWE message", async () => {
  const wallet = ethers.Wallet.createRandom();
  const challenge = createChallenge(wallet.address);

  const tamperedMessage =
    challenge.message.replace(
      "Sign in to MedChain.",
      "Sign in to another application."
    );

  const signature = await wallet.signMessage(tamperedMessage);

  await assert.rejects(
    verifyChallenge(
      wallet.address,
      tamperedMessage,
      signature,
      challenge.nonce
    ),
    /Invalid authentication message/i
  );
});

test("rejects replaying a consumed challenge", async () => {
  const wallet = ethers.Wallet.createRandom();
  const challenge = createChallenge(wallet.address);
  const signature = await wallet.signMessage(challenge.message);

  const firstVerification = await verifyChallenge(
    wallet.address,
    challenge.message,
    signature,
    challenge.nonce
  );

  assert.equal(
    firstVerification.toLowerCase(),
    wallet.address.toLowerCase()
  );

  await assert.rejects(
    verifyChallenge(
      wallet.address,
      challenge.message,
      signature,
      challenge.nonce
    ),
    /challenge not found/i
  );
});

test("rejects an expired authentication challenge", async () => {
  const wallet = ethers.Wallet.createRandom();
  const challenge = createChallenge(wallet.address);

  const originalNow = Date.now;

  try {
    // Simulate time moving beyond the challenge's 5-minute lifetime.
    Date.now = () => originalNow() + 5 * 60 * 1000;

    await assert.rejects(
      verifyChallenge(
        wallet.address,
        challenge.message,
        "0x1234",
        challenge.nonce
      ),
      /Authentication challenge expired/i
    );
  } finally {
    // Always restore the real clock for other tests.
    Date.now = originalNow;
  }
});
