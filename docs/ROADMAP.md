# Roadmap

1. **Patient web/mobile app** (React/Flutter): scan QR, call `verifyUnit`, show a green/amber/red result in Hindi and English.
2. **Manufacturer toolkit**: CLI that generates serials, builds the tree, prints QR/DataMatrix, and calls `registerBatch`; store trees in encrypted storage.
3. **Quantity-based custody**: carton/sub-batch Merkle roots so distributors can split stock.
4. **Event indexer** (The Graph or Ponder): dashboards for regulators: duplicate-scan heat-maps, recall reach, custody time.
5. **Cold-chain extension**: signed IoT temperature attestations for vaccines.
6. **GS1 alignment**: map GTIN/serial/lot/expiry to the contract's fields.
7. **Fuzz and invariant tests** with Foundry (e.g. `dispensed <= quantity`, a unit can be burned only once).
8. **Governance**: multisig + timelock for regulator/admin roles.
