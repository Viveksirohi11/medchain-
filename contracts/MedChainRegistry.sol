// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title MedChainRegistry
 * @notice Anti-counterfeit medicine traceability.
 *
 * Design summary
 * --------------
 *  - A REGULATOR licenses manufacturers, distributors and pharmacies. Only licensed
 *    actors can write to the registry, so counterfeiters cannot "register first".
 *  - A manufacturer commits a whole batch with ONE Merkle root of unit-serial hashes
 *    (O(1) storage, not O(units)). Serials are random and secret until printed on packs.
 *  - Custody of a batch moves manufacturer -> distributor(s) -> pharmacy.
 *  - A pharmacy "dispenses" a unit by revealing its serial + Merkle proof. The unit
 *    is then burned. A second scan of the same serial is a cloned-QR signal and is
 *    logged on-chain (DuplicateScan) instead of reverting, so the evidence persists.
 *  - Anyone (patients, inspectors) can verify a pack for free via the view function.
 *  - Regulator or the batch manufacturer can recall a batch; the regulator can pause.
 *
 * Production notes: give the admin to a multisig/governance, deploy on an L2 or a
 * permissioned EVM chain, and keep PII/commercial data off-chain (only hashes here).
 */
contract MedChainRegistry is AccessControl, Pausable {
    // ───────────────────────────── Roles ─────────────────────────────
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");
    bytes32 public constant MANUFACTURER_ROLE = keccak256("MANUFACTURER_ROLE");
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    bytes32 public constant PHARMACY_ROLE = keccak256("PHARMACY_ROLE");

    // ───────────────────────────── Types ─────────────────────────────
    enum BatchStatus { None, Active, Recalled }

    /// Result codes returned to a verifier, in the order the checks are applied.
    enum UnitStatus { UnknownBatch, Invalid, Genuine, AlreadyDispensed, Recalled, Expired }

    struct Batch {
        address manufacturer;
        address custodian;      // current holder of the batch
        bytes32 merkleRoot;     // root of serial hashes
        bytes32 metadataHash;   // hash of off-chain data (drug name, licence no., lab report, IPFS CID...)
        uint64 manufacturedAt;
        uint64 expiresAt;
        uint32 quantity;
        uint32 dispensed;
        uint16 hops;            // number of custody transfers
        BatchStatus status;
    }

    // ───────────────────────────── State ─────────────────────────────
    uint256 private _nextBatchId = 1;
    mapping(uint256 => Batch) private _batches;
    mapping(bytes32 => uint256) public batchIdByRoot;                  // prevents re-registering a root
    mapping(bytes32 => bool) private _dispensed;                       // keccak(batchId, serialHash)
    mapping(bytes32 => mapping(address => bytes32)) public licenseOf;  // role => actor => licence id hash

    // ───────────────────────────── Events ────────────────────────────
    event ActorLicensed(address indexed actor, bytes32 indexed role, bytes32 licenseId);
    event ActorRevoked(address indexed actor, bytes32 indexed role);
    event BatchRegistered(uint256 indexed batchId, address indexed manufacturer, bytes32 merkleRoot, bytes32 metadataHash, uint32 quantity, uint64 expiresAt);
    event CustodyTransferred(uint256 indexed batchId, address indexed from, address indexed to);
    event UnitDispensed(uint256 indexed batchId, bytes32 indexed serialHash, address indexed pharmacy);
    event DuplicateScan(uint256 indexed batchId, bytes32 indexed serialHash, address indexed scanner);
    event BatchRecalled(uint256 indexed batchId, address indexed by, bytes32 reasonHash);

    // ───────────────────────────── Errors ────────────────────────────
    error InvalidRole();
    error InvalidParams();
    error RoleConflict();
    error DuplicateRoot();
    error UnknownBatch();
    error BatchNotActive();
    error BatchExpired();
    error NotCustodian();
    error InvalidTransfer();
    error InvalidProof();
    error NotRecallAuthority();

    constructor(address admin) {
        if (admin == address(0)) revert InvalidParams();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGULATOR_ROLE, admin);
        // Only regulators manage operational roles.
        _setRoleAdmin(MANUFACTURER_ROLE, REGULATOR_ROLE);
        _setRoleAdmin(DISTRIBUTOR_ROLE, REGULATOR_ROLE);
        _setRoleAdmin(PHARMACY_ROLE, REGULATOR_ROLE);
        _setRoleAdmin(REGULATOR_ROLE, DEFAULT_ADMIN_ROLE);
    }

    // ───────────────────────── Licensing (regulator) ─────────────────
    function licenseActor(address actor, bytes32 role, bytes32 licenseId) external onlyRole(REGULATOR_ROLE) {
        if (!_isOperationalRole(role)) revert InvalidRole();
        if (actor == address(0) || licenseId == bytes32(0)) revert InvalidParams();
        // One operational role per address keeps custody rules unambiguous.
        if (_stage(actor) != 0 && !hasRole(role, actor)) revert RoleConflict();
        _grantRole(role, actor);
        licenseOf[role][actor] = licenseId;
        emit ActorLicensed(actor, role, licenseId);
    }

    function revokeActor(address actor, bytes32 role) external onlyRole(REGULATOR_ROLE) {
        if (!_isOperationalRole(role)) revert InvalidRole();
        _revokeRole(role, actor);
        delete licenseOf[role][actor];
        emit ActorRevoked(actor, role);
    }

    function pause() external onlyRole(REGULATOR_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(REGULATOR_ROLE) {
        _unpause();
    }

    // ───────────────────────── Manufacturer ──────────────────────────
    function registerBatch(bytes32 merkleRoot, bytes32 metadataHash, uint64 expiresAt, uint32 quantity)
        external
        onlyRole(MANUFACTURER_ROLE)
        whenNotPaused
        returns (uint256 batchId)
    {
        if (merkleRoot == bytes32(0) || quantity == 0 || expiresAt <= block.timestamp) revert InvalidParams();
        if (batchIdByRoot[merkleRoot] != 0) revert DuplicateRoot();

        batchId = _nextBatchId++;
        batchIdByRoot[merkleRoot] = batchId;
        _batches[batchId] = Batch({
            manufacturer: msg.sender,
            custodian: msg.sender,
            merkleRoot: merkleRoot,
            metadataHash: metadataHash,
            manufacturedAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            quantity: quantity,
            dispensed: 0,
            hops: 0,
            status: BatchStatus.Active
        });
        emit BatchRegistered(batchId, msg.sender, merkleRoot, metadataHash, quantity, expiresAt);
    }

    // ───────────────────────── Custody chain ─────────────────────────
    /// Allowed: manufacturer->{distributor,pharmacy}, distributor->{distributor,pharmacy}.
    function transferCustody(uint256 batchId, address to) external whenNotPaused {
        Batch storage b = _activeBatch(batchId);
        if (b.custodian != msg.sender) revert NotCustodian();
        uint8 fromStage = _stage(msg.sender);
        uint8 toStage = _stage(to);
        if (fromStage == 0 || fromStage == 3 || toStage < 2 || to == msg.sender) revert InvalidTransfer();

        b.custodian = to;
        unchecked {
            b.hops++;
        }
        emit CustodyTransferred(batchId, msg.sender, to);
    }

    // ───────────────────────── Pharmacy ──────────────────────────────
    /**
     * @notice Sell one unit. Reveals the serial + proof and burns the unit.
     * @return ok true if recorded; false if this serial was already dispensed
     *         (cloned/duplicated pack). The duplicate is logged, not reverted.
     */
    function dispense(uint256 batchId, string calldata serial, bytes32[] calldata proof)
        external
        onlyRole(PHARMACY_ROLE)
        whenNotPaused
        returns (bool ok)
    {
        Batch storage b = _activeBatch(batchId);
        if (b.custodian != msg.sender) revert NotCustodian();
        if (block.timestamp >= b.expiresAt) revert BatchExpired();

        bytes32 sh = _serialHash(serial);
        if (!MerkleProof.verifyCalldata(proof, b.merkleRoot, _leaf(sh))) revert InvalidProof();

        bytes32 key = keccak256(abi.encode(batchId, sh));
        if (_dispensed[key]) {
            emit DuplicateScan(batchId, sh, msg.sender);
            return false;
        }
        _dispensed[key] = true;
        unchecked {
            b.dispensed++;
        }
        emit UnitDispensed(batchId, sh, msg.sender);
        return true;
    }

    // ───────────────────────── Recall ────────────────────────────────
    function recallBatch(uint256 batchId, bytes32 reasonHash) external {
        Batch storage b = _batches[batchId];
        if (b.status == BatchStatus.None) revert UnknownBatch();
        if (!hasRole(REGULATOR_ROLE, msg.sender) && msg.sender != b.manufacturer) revert NotRecallAuthority();
        if (b.status == BatchStatus.Recalled) revert BatchNotActive();
        b.status = BatchStatus.Recalled;
        emit BatchRecalled(batchId, msg.sender, reasonHash);
    }

    // ───────────────────────── Public verification ───────────────────
    /// Free, gasless check anyone can run from a QR scan (batchId + serial + proof).
    function verifyUnit(uint256 batchId, string calldata serial, bytes32[] calldata proof)
        external
        view
        returns (UnitStatus)
    {
        Batch storage b = _batches[batchId];
        if (b.status == BatchStatus.None) return UnitStatus.UnknownBatch;

        bytes32 sh = _serialHash(serial);
        if (!MerkleProof.verifyCalldata(proof, b.merkleRoot, _leaf(sh))) return UnitStatus.Invalid;
        if (b.status == BatchStatus.Recalled) return UnitStatus.Recalled;
        if (block.timestamp >= b.expiresAt) return UnitStatus.Expired;
        if (_dispensed[keccak256(abi.encode(batchId, sh))]) return UnitStatus.AlreadyDispensed;
        return UnitStatus.Genuine;
    }

    function getBatch(uint256 batchId) external view returns (Batch memory) {
        if (_batches[batchId].status == BatchStatus.None) revert UnknownBatch();
        return _batches[batchId];
    }

    function totalBatches() external view returns (uint256) {
        return _nextBatchId - 1;
    }

    // ───────────────────────── Internals ─────────────────────────────
    function _activeBatch(uint256 batchId) private view returns (Batch storage b) {
        b = _batches[batchId];
        if (b.status == BatchStatus.None) revert UnknownBatch();
        if (b.status != BatchStatus.Active) revert BatchNotActive();
    }

    function _serialHash(string calldata serial) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(serial));
    }

    // Matches the OpenZeppelin merkle-tree StandardMerkleTree with leaf type ["bytes32"].
    function _leaf(bytes32 serialHash) private pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(serialHash))));
    }

    function _isOperationalRole(bytes32 role) private pure returns (bool) {
        return role == MANUFACTURER_ROLE || role == DISTRIBUTOR_ROLE || role == PHARMACY_ROLE;
    }

    /// 1 = manufacturer, 2 = distributor, 3 = pharmacy, 0 = none.
    function _stage(address a) private view returns (uint8) {
        if (hasRole(MANUFACTURER_ROLE, a)) return 1;
        if (hasRole(DISTRIBUTOR_ROLE, a)) return 2;
        if (hasRole(PHARMACY_ROLE, a)) return 3;
        return 0;
    }
}
