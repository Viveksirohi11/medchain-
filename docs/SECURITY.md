# Security Notes and Threat Model

> This is a reference implementation. It has **not** been professionally audited.

## Threats and how the design responds

| Threat | Mitigation | Residual risk |
|---|---|---|
| Counterfeiter registers fake batches | Only regulator-licensed `MANUFACTURER_ROLE` can register | Compromised/rogue licensed manufacturer key |
| Invented serials on fake packs | Serials must prove membership in the committed Merkle root; verify returns `Invalid` | None for unknown serials (128-bit random) |
| Cloned genuine QR | First dispense burns the unit; later scans show `AlreadyDispensed`; `DuplicateScan` event logged | A clone seen **before** the genuine pack is sold looks `Genuine` (see below) |
| Serial guessing / enumeration | Random 128-bit serials; only the root is on-chain | Serials printed on packs are inherently visible to holders |
| Rogue actor skips the chain | Custody transitions enforced; only custodian pharmacy can dispense | Physical goods can still be swapped off-chain |
| Key theft | Role revocation; pause | Use hardware wallets/multisig; consider per-site keys |
| Regulator key compromise | `DEFAULT_ADMIN_ROLE` should be a multisig/timelock | Governance design is out of scope here |
| Recall must not be blockable | `recallBatch` has no `whenNotPaused` | Authorised callers only |

## Known limitations (honest list)

1. **Oracle problem.** A blockchain proves *records*, not physical reality. A fake pack carrying a genuine
   serial that nobody has sold yet cannot be told apart. Mitigations: tamper-evident packaging, patient-side
   scan logging, and cross-checking scan counts / locations off-chain.
2. **Privacy of `dispense` calldata.** The serial is revealed on-chain when dispensed. A mempool observer
   could copy it, but only a licensed pharmacy holding custody can call `dispense`, which limits abuse.
3. **Batch-level custody.** Batches are not split between distributors or pharmacies. Real deployments need
   quantity-based custody (e.g. sub-batches or carton-level Merkle roots).
4. **Single registry.** No upgradeability by design. Add a proxy pattern only with strong governance.
5. **Data protection.** No patient personal data is stored. Do not add any. Keep commercial data off-chain
   and store only hashes.
6. **Not a substitute for lab testing.** NSQ detection needs quality control. This system only proves origin
   and path.

## Before production

- Independent audit; Slither/Mythril static analysis; fuzz/invariant tests (Foundry).
- Deploy on an L2 or a permissioned EVM network; multisig + timelock for admin.
- Align the data model with GS1/GTIN standards used in India's QR/track-and-trace rules and with CDSCO systems.
- Legal review (Drugs and Cosmetics Act obligations, data localisation, e-signatures).
