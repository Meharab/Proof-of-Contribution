// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ProofOfContribution
 * @notice Lightweight pool-based reward system where sponsors create ERC20-funded pools,
 * contributors register contribution hashes, and whitelisted attestors sign EIP-712 attestations
 * that allow contributors to claim rewards.
 */

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    uint256 private _status;

    constructor() {
        _status = _NOT_ENTERED;
    }

    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}

contract ProofOfContribution is EIP712, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    enum PoolState { Active, Closed }
    enum ContributionState { Submitted, Attested, Claimed, Rejected }

    struct Pool {
        address creator;           
        address token;             
        uint256 totalFund;         
        uint256 rewardPerContribution;
        uint256 createdAt;
        uint256 expiresAt;         
        PoolState state;
        uint256 contributionsCount;
    }

    struct Contribution {
        bytes32 contributionHash;  
        address contributor;
        uint256 submittedAt;
        uint256 reward;           
        ContributionState state;
        address attestor;         
    }

    string private constant SIGNING_DOMAIN = "ProofOfContribution";
    string private constant SIGNATURE_VERSION = "1";

    bytes32 private constant ATTESTATION_TYPEHASH = keccak256(
        "ContributionAttestation(uint256 poolId,uint256 contributionId,bytes32 contributionHash,address contributor,bool valid,uint256 timestamp)"
    );

    mapping(uint256 => Pool) public pools;
    mapping(uint256 => mapping(uint256 => Contribution)) public contributions;
    mapping(address => bool) public attestors;

    uint256 public poolCount;

    event PoolCreated(uint256 indexed poolId, address indexed creator, address token, uint256 fund, uint256 rewardPerContribution, uint256 expiresAt);
    event PoolFunded(uint256 indexed poolId, address indexed funder, uint256 amount);
    event PoolClosed(uint256 indexed poolId, address indexed closer);
    event ContributionSubmitted(uint256 indexed poolId, uint256 indexed contributionId, bytes32 contributionHash, address indexed contributor);
    event ContributionAttested(uint256 indexed poolId, uint256 indexed contributionId, address indexed attestor, bool valid);
    event Claimed(uint256 indexed poolId, uint256 indexed contributionId, address indexed claimant, uint256 amount);
    event UnclaimedWithdrawn(uint256 indexed poolId, address indexed recipient, uint256 amount);
    event AttestorUpdated(address indexed attestor, bool allowed);

    error PoolNotFound(uint256 poolId);
    error PoolClosedOrExpired(uint256 poolId);
    error NotPoolCreator();
    error InsufficientFunds(uint256 available, uint256 required);
    error NotAttestor();
    error InvalidAttestation();
    error AlreadyClaimed(uint256 poolId, uint256 contributionId);
    error ContributionNotFound(uint256 poolId, uint256 contributionId);

    constructor() EIP712(SIGNING_DOMAIN, SIGNATURE_VERSION) Ownable(msg.sender) {}

    modifier poolExists(uint256 poolId) {
        if (poolId == 0 || pools[poolId].creator == address(0)) revert PoolNotFound(poolId);
        _;
    }

    modifier onlyPoolCreator(uint256 poolId) {
        if (msg.sender != pools[poolId].creator) revert NotPoolCreator();
        _;
    }

    modifier onlyAttestor() {
        if (!attestors[msg.sender]) revert NotAttestor();
        _;
    }

    function setAttestor(address _attestor, bool _allowed) external onlyOwner {
        attestors[_attestor] = _allowed;
        emit AttestorUpdated(_attestor, _allowed);
    }

    function createPool(
        address token,
        uint256 fundAmount,
        uint256 rewardPerContribution,
        uint256 expiresAt
    ) external returns (uint256) {
        require(token != address(0), "token must be non-zero");

        poolCount++;
        uint256 pid = poolCount;

        pools[pid] = Pool({
            creator: msg.sender,
            token: token,
            totalFund: 0,
            rewardPerContribution: rewardPerContribution,
            createdAt: block.timestamp,
            expiresAt: expiresAt,
            state: PoolState.Active,
            contributionsCount: 0
        });

        if (fundAmount > 0) {
            IERC20(token).safeTransferFrom(msg.sender, address(this), fundAmount);
            pools[pid].totalFund = fundAmount;
            emit PoolFunded(pid, msg.sender, fundAmount);
        }

        emit PoolCreated(pid, msg.sender, token, fundAmount, rewardPerContribution, expiresAt);
        return pid;
    }

    function fundPool(uint256 poolId, uint256 amount) external poolExists(poolId) {
        Pool storage p = pools[poolId];
        require(p.state == PoolState.Active, "pool not active");
        IERC20(p.token).safeTransferFrom(msg.sender, address(this), amount);
        p.totalFund += amount;
        emit PoolFunded(poolId, msg.sender, amount);
    }

    function closePool(uint256 poolId) external poolExists(poolId) onlyPoolCreator(poolId) {
        Pool storage p = pools[poolId];
        p.state = PoolState.Closed;
        emit PoolClosed(poolId, msg.sender);
    }

    function submitContribution(uint256 poolId, bytes32 contributionHash) external poolExists(poolId) returns (uint256) {
        Pool storage p = pools[poolId];
        if (p.state != PoolState.Active) revert PoolClosedOrExpired(poolId);
        if (p.expiresAt != 0 && block.timestamp > p.expiresAt) revert PoolClosedOrExpired(poolId);

        p.contributionsCount++;
        uint256 cid = p.contributionsCount;

        contributions[poolId][cid] = Contribution({
            contributionHash: contributionHash,
            contributor: msg.sender,
            submittedAt: block.timestamp,
            reward: 0,
            state: ContributionState.Submitted,
            attestor: address(0)
        });

        emit ContributionSubmitted(poolId, cid, contributionHash, msg.sender);
        return cid;
    }

    function attestOnChain(uint256 poolId, uint256 contributionId, bool valid)
        external
        poolExists(poolId)
        onlyAttestor
    {
        Contribution storage c = contributions[poolId][contributionId];
        if (c.contributor == address(0)) revert ContributionNotFound(poolId, contributionId);
        if (c.state == ContributionState.Claimed) revert AlreadyClaimed(poolId, contributionId);

        c.attestor = msg.sender;
        c.state = valid ? ContributionState.Attested : ContributionState.Rejected;
        if (valid) {
            c.reward = pools[poolId].rewardPerContribution;
        } else {
            c.reward = 0;
        }
        emit ContributionAttested(poolId, contributionId, msg.sender, valid);
    }

    function _hashAttestation(
        uint256 poolId,
        uint256 contributionId,
        bytes32 contributionHash,
        address contributor,
        bool valid,
        uint256 timestamp
    ) internal view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            ATTESTATION_TYPEHASH,
            poolId,
            contributionId,
            contributionHash,
            contributor,
            valid,
            timestamp
        )));
    }

    function _recoverAttestorSigner(
        uint256 poolId,
        uint256 contributionId,
        bytes32 contributionHash,
        address contributor,
        bool valid,
        uint256 timestamp,
        bytes calldata signature
    ) internal view returns (address) {
        bytes32 digest = _hashAttestation(poolId, contributionId, contributionHash, contributor, valid, timestamp);
        return ECDSA.recover(digest, signature);
    }

    function claimWithAttestation(
        uint256 poolId,
        uint256 contributionId,
        bool valid,
        uint256 timestamp,
        bytes calldata signature
    ) external nonReentrant poolExists(poolId) {
        Contribution storage c = contributions[poolId][contributionId];
        if (c.contributor == address(0)) revert ContributionNotFound(poolId, contributionId);
        if (c.state == ContributionState.Claimed) revert AlreadyClaimed(poolId, contributionId);

        Pool storage p = pools[poolId];
        if (p.state != PoolState.Active && p.state != PoolState.Closed) {
            revert PoolClosedOrExpired(poolId);
        }
        if (p.expiresAt != 0 && block.timestamp > p.expiresAt) revert PoolClosedOrExpired(poolId);
        bytes32 storedHash = c.contributionHash;
        address contributor = c.contributor;

        address signer = _recoverAttestorSigner(poolId, contributionId, storedHash, contributor, valid, timestamp, signature);
        if (!attestors[signer]) revert InvalidAttestation();

        if (timestamp < c.submittedAt) revert InvalidAttestation();

        if (!valid) {
            c.state = ContributionState.Rejected;
            c.attestor = signer;
            emit ContributionAttested(poolId, contributionId, signer, false);
            return;
        }

        uint256 reward = p.rewardPerContribution;
        if (p.totalFund < reward) revert InsufficientFunds(p.totalFund, reward);

        c.state = ContributionState.Claimed;
        c.attestor = signer;
        c.reward = reward;
        p.totalFund -= reward;

        IERC20(p.token).safeTransfer(contributor, reward);

        emit ContributionAttested(poolId, contributionId, signer, true);
        emit Claimed(poolId, contributionId, contributor, reward);
    }

    function withdrawUnclaimed(uint256 poolId, uint256 amount) external nonReentrant poolExists(poolId) onlyPoolCreator(poolId) {
        Pool storage p = pools[poolId];
        if (p.state == PoolState.Active && (p.expiresAt == 0 || block.timestamp <= p.expiresAt)) {
            revert("withdraw not allowed while pool active");
        }
        require(amount <= p.totalFund, "amount > available");
        p.totalFund -= amount;
        IERC20(p.token).safeTransfer(msg.sender, amount);
        emit UnclaimedWithdrawn(poolId, msg.sender, amount);
    }

    function getPool(uint256 poolId) external view poolExists(poolId) returns (Pool memory) {
        return pools[poolId];
    }

    function getContribution(uint256 poolId, uint256 contributionId) external view returns (Contribution memory) {
        Contribution storage c = contributions[poolId][contributionId];
        if (c.contributor == address(0)) revert ContributionNotFound(poolId, contributionId);
        return c;
    }
}
