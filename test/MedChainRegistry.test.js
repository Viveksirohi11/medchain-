const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { generateSerials, buildBatch, serialHash } = require("../scripts/lib/merkle");

const S = { UnknownBatch: 0, Invalid: 1, Genuine: 2, AlreadyDispensed: 3, Recalled: 4, Expired: 5 };
const DAY = 24 * 60 * 60;

async function deployFixture() {
  const [admin, mfr, dist, dist2, pharm, pharm2, stranger] = await ethers.getSigners();
  const registry = await (await ethers.getContractFactory("MedChainRegistry")).deploy(admin.address);

  const MFR = await registry.MANUFACTURER_ROLE();
  const DIST = await registry.DISTRIBUTOR_ROLE();
  const PHARM = await registry.PHARMACY_ROLE();

  await registry.licenseActor(mfr.address, MFR, ethers.id("LIC-MFR-1"));
  await registry.licenseActor(dist.address, DIST, ethers.id("LIC-DIST-1"));
  await registry.licenseActor(dist2.address, DIST, ethers.id("LIC-DIST-2"));
  await registry.licenseActor(pharm.address, PHARM, ethers.id("LIC-PH-1"));
  await registry.licenseActor(pharm2.address, PHARM, ethers.id("LIC-PH-2"));

  return { registry, admin, mfr, dist, dist2, pharm, pharm2, stranger, MFR, DIST, PHARM };
}

async function batchFixture() {
  const base = await deployFixture();
  const serials = generateSerials(8);
  const batch = buildBatch(serials);
  const expiresAt = (await time.latest()) + 365 * DAY;
  await base.registry.connect(base.mfr).registerBatch(batch.root, ethers.id("meta"), expiresAt, serials.length);
  return { ...base, serials, batch, expiresAt, batchId: 1n };
}

/** Batch already handed manufacturer -> distributor -> pharmacy. */
async function atPharmacyFixture() {
  const f = await batchFixture();
  await f.registry.connect(f.mfr).transferCustody(f.batchId, f.dist.address);
  await f.registry.connect(f.dist).transferCustody(f.batchId, f.pharm.address);
  return f;
}

describe("MedChainRegistry", () => {
  describe("licensing", () => {
    it("only regulators can license actors", async () => {
      const { registry, stranger, MFR } = await loadFixture(deployFixture);
      await expect(registry.connect(stranger).licenseActor(stranger.address, MFR, ethers.id("x"))).to.be.reverted;
    });

    it("rejects non-operational roles, zero values and role conflicts", async () => {
      const { registry, mfr, stranger, DIST, PHARM } = await loadFixture(deployFixture);
      const regulatorRole = await registry.REGULATOR_ROLE();
      await expect(registry.licenseActor(stranger.address, regulatorRole, ethers.id("x"))).to.be.revertedWithCustomError(registry, "InvalidRole");
      await expect(registry.licenseActor(ethers.ZeroAddress, PHARM, ethers.id("x"))).to.be.revertedWithCustomError(registry, "InvalidParams");
      await expect(registry.licenseActor(stranger.address, PHARM, ethers.ZeroHash)).to.be.revertedWithCustomError(registry, "InvalidParams");
      await expect(registry.licenseActor(mfr.address, DIST, ethers.id("x"))).to.be.revertedWithCustomError(registry, "RoleConflict");
    });

    it("stores the licence hash and emits an event", async () => {
      const { registry, stranger, PHARM } = await loadFixture(deployFixture);
      const lic = ethers.id("LIC-NEW");
      await expect(registry.licenseActor(stranger.address, PHARM, lic)).to.emit(registry, "ActorLicensed").withArgs(stranger.address, PHARM, lic);
      expect(await registry.licenseOf(PHARM, stranger.address)).to.equal(lic);
    });

    it("a revoked manufacturer can no longer register batches", async () => {
      const { registry, mfr, MFR } = await loadFixture(deployFixture);
      await registry.revokeActor(mfr.address, MFR);
      const exp = (await time.latest()) + DAY;
      await expect(registry.connect(mfr).registerBatch(ethers.id("r"), ethers.ZeroHash, exp, 1)).to.be.reverted;
      expect(await registry.licenseOf(MFR, mfr.address)).to.equal(ethers.ZeroHash);
    });
  });

  describe("batch registration", () => {
    it("stores the batch and emits BatchRegistered", async () => {
      const { registry, mfr, serials, batch, expiresAt, batchId } = await loadFixture(batchFixture);
      const b = await registry.getBatch(batchId);
      expect(b.manufacturer).to.equal(mfr.address);
      expect(b.custodian).to.equal(mfr.address);
      expect(b.merkleRoot).to.equal(batch.root);
      expect(b.quantity).to.equal(serials.length);
      expect(b.expiresAt).to.equal(expiresAt);
      expect(await registry.totalBatches()).to.equal(1);
    });

    it("blocks unlicensed callers (counterfeiter cannot register)", async () => {
      const { registry, stranger } = await loadFixture(deployFixture);
      const exp = (await time.latest()) + DAY;
      await expect(registry.connect(stranger).registerBatch(ethers.id("fake"), ethers.ZeroHash, exp, 10)).to.be.reverted;
    });

    it("rejects duplicate roots and bad parameters", async () => {
      const { registry, mfr, batch, expiresAt } = await loadFixture(batchFixture);
      await expect(registry.connect(mfr).registerBatch(batch.root, ethers.ZeroHash, expiresAt, 5)).to.be.revertedWithCustomError(registry, "DuplicateRoot");
      await expect(registry.connect(mfr).registerBatch(ethers.ZeroHash, ethers.ZeroHash, expiresAt, 5)).to.be.revertedWithCustomError(registry, "InvalidParams");
      await expect(registry.connect(mfr).registerBatch(ethers.id("a"), ethers.ZeroHash, expiresAt, 0)).to.be.revertedWithCustomError(registry, "InvalidParams");
      await expect(registry.connect(mfr).registerBatch(ethers.id("b"), ethers.ZeroHash, 1, 5)).to.be.revertedWithCustomError(registry, "InvalidParams");
    });
  });

  describe("custody chain", () => {
    it("moves manufacturer -> distributor -> distributor -> pharmacy", async () => {
      const { registry, mfr, dist, dist2, pharm, batchId } = await loadFixture(batchFixture);
      await expect(registry.connect(mfr).transferCustody(batchId, dist.address)).to.emit(registry, "CustodyTransferred").withArgs(batchId, mfr.address, dist.address);
      await registry.connect(dist).transferCustody(batchId, dist2.address);
      await registry.connect(dist2).transferCustody(batchId, pharm.address);
      const b = await registry.getBatch(batchId);
      expect(b.custodian).to.equal(pharm.address);
      expect(b.hops).to.equal(3);
    });

    it("only the current custodian can transfer", async () => {
      const { registry, dist, stranger, batchId } = await loadFixture(batchFixture);
      await expect(registry.connect(stranger).transferCustody(batchId, dist.address)).to.be.revertedWithCustomError(registry, "NotCustodian");
    });

    it("rejects transfers to unlicensed, to self, or away from a pharmacy", async () => {
      const { registry, mfr, stranger, pharm, pharm2, batchId } = await loadFixture(batchFixture);
      await expect(registry.connect(mfr).transferCustody(batchId, stranger.address)).to.be.revertedWithCustomError(registry, "InvalidTransfer");
      await expect(registry.connect(mfr).transferCustody(batchId, mfr.address)).to.be.revertedWithCustomError(registry, "InvalidTransfer");
      await registry.connect(mfr).transferCustody(batchId, pharm.address);
      await expect(registry.connect(pharm).transferCustody(batchId, pharm2.address)).to.be.revertedWithCustomError(registry, "InvalidTransfer");
    });

    it("rejects unknown batches", async () => {
      const { registry, mfr, dist } = await loadFixture(batchFixture);
      await expect(registry.connect(mfr).transferCustody(99, dist.address)).to.be.revertedWithCustomError(registry, "UnknownBatch");
    });
  });

  describe("dispensing", () => {
    it("dispenses a genuine unit and burns it", async () => {
      const { registry, pharm, serials, batch, batchId } = await loadFixture(atPharmacyFixture);
      const s = serials[0];
      await expect(registry.connect(pharm).dispense(batchId, s, batch.proofOf(s)))
        .to.emit(registry, "UnitDispensed")
        .withArgs(batchId, serialHash(s), pharm.address);
      expect((await registry.getBatch(batchId)).dispensed).to.equal(1);
      expect(await registry.verifyUnit(batchId, s, batch.proofOf(s))).to.equal(S.AlreadyDispensed);
    });

    it("logs (not reverts) a duplicate scan: cloned QR evidence", async () => {
      const { registry, pharm, serials, batch, batchId } = await loadFixture(atPharmacyFixture);
      const s = serials[1];
      await registry.connect(pharm).dispense(batchId, s, batch.proofOf(s));
      expect(await registry.connect(pharm).dispense.staticCall(batchId, s, batch.proofOf(s))).to.equal(false);
      await expect(registry.connect(pharm).dispense(batchId, s, batch.proofOf(s)))
        .to.emit(registry, "DuplicateScan")
        .withArgs(batchId, serialHash(s), pharm.address);
      expect((await registry.getBatch(batchId)).dispensed).to.equal(1);
    });

    it("rejects forged serials and wrong proofs", async () => {
      const { registry, pharm, serials, batch, batchId } = await loadFixture(atPharmacyFixture);
      await expect(registry.connect(pharm).dispense(batchId, "MC-FORGED-0000", batch.proofOf(serials[0]))).to.be.revertedWithCustomError(registry, "InvalidProof");
      await expect(registry.connect(pharm).dispense(batchId, serials[0], batch.proofOf(serials[1]))).to.be.revertedWithCustomError(registry, "InvalidProof");
    });

    it("only the pharmacy holding custody can dispense", async () => {
      const { registry, pharm2, mfr, serials, batch, batchId } = await loadFixture(atPharmacyFixture);
      const s = serials[0];
      await expect(registry.connect(pharm2).dispense(batchId, s, batch.proofOf(s))).to.be.revertedWithCustomError(registry, "NotCustodian");
      await expect(registry.connect(mfr).dispense(batchId, s, batch.proofOf(s))).to.be.reverted; // not a pharmacy
    });

    it("blocks dispensing from recalled batches", async () => {
      const { registry, pharm, serials, batch, batchId } = await loadFixture(atPharmacyFixture);
      const s = serials[0];
      await registry.recallBatch(batchId, ethers.id("contamination"));
      await expect(registry.connect(pharm).dispense(batchId, s, batch.proofOf(s))).to.be.revertedWithCustomError(registry, "BatchNotActive");
    });

    it("blocks dispensing after expiry", async () => {
      const { registry, pharm, serials, batch, batchId } = await loadFixture(atPharmacyFixture);
      await time.increase(366 * DAY);
      const s = serials[0];
      await expect(registry.connect(pharm).dispense(batchId, s, batch.proofOf(s))).to.be.revertedWithCustomError(registry, "BatchExpired");
    });

    it("is blocked while paused and works again after unpause", async () => {
      const { registry, pharm, serials, batch, batchId } = await loadFixture(atPharmacyFixture);
      const s = serials[0];
      await registry.pause();
      await expect(registry.connect(pharm).dispense(batchId, s, batch.proofOf(s))).to.be.revertedWithCustomError(registry, "EnforcedPause");
      await registry.unpause();
      await expect(registry.connect(pharm).dispense(batchId, s, batch.proofOf(s))).to.emit(registry, "UnitDispensed");
    });
  });

  describe("public verification", () => {
    it("returns the right status for every case", async () => {
      const { registry, pharm, serials, batch, batchId } = await loadFixture(atPharmacyFixture);
      const [a, b] = serials;

      expect(await registry.verifyUnit(99, a, batch.proofOf(a))).to.equal(S.UnknownBatch);
      expect(await registry.verifyUnit(batchId, "MC-FAKE", batch.proofOf(a))).to.equal(S.Invalid);
      expect(await registry.verifyUnit(batchId, a, batch.proofOf(a))).to.equal(S.Genuine);

      await registry.connect(pharm).dispense(batchId, a, batch.proofOf(a));
      expect(await registry.verifyUnit(batchId, a, batch.proofOf(a))).to.equal(S.AlreadyDispensed);

      await registry.recallBatch(batchId, ethers.id("recall"));
      expect(await registry.verifyUnit(batchId, b, batch.proofOf(b))).to.equal(S.Recalled);
      // forged packs still report Invalid, even for a recalled batch
      expect(await registry.verifyUnit(batchId, "MC-FAKE", batch.proofOf(a))).to.equal(S.Invalid);
    });

    it("reports Expired after the expiry date", async () => {
      const { registry, serials, batch, batchId } = await loadFixture(batchFixture);
      await time.increase(366 * DAY);
      expect(await registry.verifyUnit(batchId, serials[0], batch.proofOf(serials[0]))).to.equal(S.Expired);
    });

    it("every serial in a larger batch verifies (merkle correctness)", async () => {
      const { registry, mfr } = await loadFixture(deployFixture);
      const serials = generateSerials(137);
      const batch = buildBatch(serials);
      const exp = (await time.latest()) + DAY;
      await registry.connect(mfr).registerBatch(batch.root, ethers.ZeroHash, exp, serials.length);
      for (const s of serials) {
        expect(await registry.verifyUnit(1, s, batch.proofOf(s))).to.equal(S.Genuine);
      }
    });
  });

  describe("recall", () => {
    it("regulator or the batch's own manufacturer can recall; others cannot", async () => {
      const { registry, stranger, mfr, batchId } = await loadFixture(batchFixture);
      await expect(registry.connect(stranger).recallBatch(batchId, ethers.ZeroHash)).to.be.revertedWithCustomError(registry, "NotRecallAuthority");
      await expect(registry.connect(mfr).recallBatch(batchId, ethers.id("why")))
        .to.emit(registry, "BatchRecalled")
        .withArgs(batchId, mfr.address, ethers.id("why"));
      await expect(registry.recallBatch(batchId, ethers.ZeroHash)).to.be.revertedWithCustomError(registry, "BatchNotActive");
    });

    it("works even while paused (safety actions must never be blockable)", async () => {
      const { registry, batchId } = await loadFixture(batchFixture);
      await registry.pause();
      await expect(registry.recallBatch(batchId, ethers.ZeroHash)).to.emit(registry, "BatchRecalled");
    });

    it("rejects unknown batches", async () => {
      const { registry } = await loadFixture(batchFixture);
      await expect(registry.recallBatch(42, ethers.ZeroHash)).to.be.revertedWithCustomError(registry, "UnknownBatch");
    });
  });
});
