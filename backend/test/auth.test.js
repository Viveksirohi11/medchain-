
const test = require("node:test");
const assert = require("node:assert/strict");
const { ethers } = require("ethers");

const {
  createChallenge,
  verifyChallenge,
} = require("../src/auth");

test("rejects an invalid SIWE signature", async () => {
  const wallet = ethers.Wallet.createRandom();
  const challenge = createChallenge(wallet.address);

  await assert.rejects(
    verifyChallenge(
      wallet.address,
      challenge.message,
      "0x1234",
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
