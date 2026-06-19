// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title DataLoopCore
/// @notice Week 1 contract layer for task, correction, dataset, and stake flows.
contract DataLoopCore {
    error InvalidOwner();
    error InvalidTaskId();
    error InvalidDatasetId();
    error MissingMetadataReference();
    error TaskAlreadyExists(bytes32 taskId);
    error TaskNotFound(bytes32 taskId);
    error CorrectionNotFound(uint256 correctionId);
    error DatasetVersionNotFound(bytes32 datasetId, uint256 version);
    error Unauthorized();
    error ZeroStakeAmount();
    error StakeNotFound(uint256 stakeId);
    error StakeAlreadyReleased(uint256 stakeId);
    error StakeStillLocked(uint256 stakeId, uint256 unlockTimestamp);

    enum StakeReferenceType {
        Task,
        Correction
    }

    struct Task {
        bytes32 id;
        address creator;
        uint64 createdAt;
        string metadataURI;
        bytes32 metadataHash;
        uint256 totalStake;
        bool exists;
    }

    struct Correction {
        uint256 id;
        bytes32 taskId;
        address submitter;
        uint64 submittedAt;
        string metadataURI;
        bytes32 metadataHash;
        uint256 totalStake;
        bool exists;
    }

    struct DatasetVersion {
        bytes32 datasetId;
        uint256 version;
        address registrar;
        uint64 registeredAt;
        string metadataURI;
        bytes32 metadataHash;
        bool exists;
    }

    struct Stake {
        uint256 id;
        address staker;
        StakeReferenceType referenceType;
        bytes32 taskId;
        uint256 correctionId;
        uint256 amount;
        uint64 lockedAt;
        bool released;
    }

    event TaskCreated(
        bytes32 indexed taskId,
        address indexed creator,
        uint64 timestamp,
        string metadataURI,
        bytes32 metadataHash
    );

    event CorrectionSubmitted(
        uint256 indexed correctionId,
        bytes32 indexed taskId,
        address indexed submitter,
        uint64 timestamp,
        string metadataURI,
        bytes32 metadataHash
    );

    event DatasetRegistered(
        bytes32 indexed datasetId,
        uint256 indexed version,
        address indexed registrar,
        uint64 timestamp,
        string metadataURI,
        bytes32 metadataHash
    );

    event StakeDeposited(
        uint256 indexed stakeId,
        address indexed staker,
        StakeReferenceType indexed referenceType,
        bytes32 taskId,
        uint256 correctionId,
        uint256 amount,
        uint64 lockedAt
    );

    event StakeReleased(
        uint256 indexed stakeId,
        address indexed staker,
        uint256 amount,
        address indexed releasedBy
    );

    address public immutable owner;
    uint64 public immutable minimumStakeLockPeriod;

    uint256 public nextCorrectionId = 1;
    uint256 public nextStakeId = 1;

    mapping(bytes32 => Task) private tasks;
    mapping(uint256 => Correction) private corrections;
    mapping(bytes32 => uint256[]) private taskCorrectionIds;
    mapping(bytes32 => uint256) public latestDatasetVersion;
    mapping(bytes32 => mapping(uint256 => DatasetVersion)) private datasetVersions;
    mapping(uint256 => Stake) private stakes;

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert Unauthorized();
        }
        _;
    }

    constructor(address owner_, uint64 minimumStakeLockPeriod_) {
        if (owner_ == address(0)) {
            revert InvalidOwner();
        }

        owner = owner_;
        minimumStakeLockPeriod = minimumStakeLockPeriod_;
    }

    function createTask(bytes32 taskId, string calldata metadataURI, bytes32 metadataHash)
        external
        payable
        returns (uint256 stakeId)
    {
        _requireTaskId(taskId);
        _requireMetadataReference(metadataURI, metadataHash);

        if (tasks[taskId].exists) {
            revert TaskAlreadyExists(taskId);
        }

        uint64 timestamp = uint64(block.timestamp);
        tasks[taskId] = Task({
            id: taskId,
            creator: msg.sender,
            createdAt: timestamp,
            metadataURI: metadataURI,
            metadataHash: metadataHash,
            totalStake: 0,
            exists: true
        });

        emit TaskCreated(taskId, msg.sender, timestamp, metadataURI, metadataHash);

        if (msg.value > 0) {
            stakeId = _createStakeForTask(taskId, msg.sender, msg.value);
        }
    }

    function submitCorrection(bytes32 taskId, string calldata metadataURI, bytes32 metadataHash)
        external
        payable
        returns (uint256 correctionId, uint256 stakeId)
    {
        Task storage task = _requireTask(taskId);
        _requireMetadataReference(metadataURI, metadataHash);

        correctionId = nextCorrectionId++;
        uint64 timestamp = uint64(block.timestamp);

        corrections[correctionId] = Correction({
            id: correctionId,
            taskId: taskId,
            submitter: msg.sender,
            submittedAt: timestamp,
            metadataURI: metadataURI,
            metadataHash: metadataHash,
            totalStake: 0,
            exists: true
        });
        taskCorrectionIds[taskId].push(correctionId);

        emit CorrectionSubmitted(
            correctionId,
            taskId,
            msg.sender,
            timestamp,
            metadataURI,
            metadataHash
        );

        if (msg.value > 0) {
            stakeId = _createStakeForCorrection(task, correctionId, msg.sender, msg.value);
        }
    }

    function depositStakeForTask(bytes32 taskId) external payable returns (uint256 stakeId) {
        _requireTask(taskId);

        if (msg.value == 0) {
            revert ZeroStakeAmount();
        }

        stakeId = _createStakeForTask(taskId, msg.sender, msg.value);
    }

    function depositStakeForCorrection(uint256 correctionId) external payable returns (uint256 stakeId) {
        Correction storage correction = _requireCorrection(correctionId);

        if (msg.value == 0) {
            revert ZeroStakeAmount();
        }

        Task storage task = _requireTask(correction.taskId);
        stakeId = _createStakeForCorrection(task, correctionId, msg.sender, msg.value);
    }

    function registerDatasetVersion(bytes32 datasetId, string calldata metadataURI, bytes32 metadataHash)
        external
        onlyOwner
        returns (uint256 version)
    {
        _requireDatasetId(datasetId);
        _requireMetadataReference(metadataURI, metadataHash);

        version = latestDatasetVersion[datasetId] + 1;
        latestDatasetVersion[datasetId] = version;

        datasetVersions[datasetId][version] = DatasetVersion({
            datasetId: datasetId,
            version: version,
            registrar: msg.sender,
            registeredAt: uint64(block.timestamp),
            metadataURI: metadataURI,
            metadataHash: metadataHash,
            exists: true
        });

        emit DatasetRegistered(
            datasetId,
            version,
            msg.sender,
            uint64(block.timestamp),
            metadataURI,
            metadataHash
        );
    }

    function releaseStake(uint256 stakeId) external {
        Stake storage stake = _requireStake(stakeId);

        if (stake.released) {
            revert StakeAlreadyReleased(stakeId);
        }

        if (msg.sender != owner && msg.sender != stake.staker) {
            revert Unauthorized();
        }

        uint256 unlockTimestamp = uint256(stake.lockedAt) + uint256(minimumStakeLockPeriod);
        if (msg.sender != owner && block.timestamp < unlockTimestamp) {
            revert StakeStillLocked(stakeId, unlockTimestamp);
        }

        stake.released = true;

        (bool success,) = payable(stake.staker).call{value: stake.amount}("");
        require(success, "stake transfer failed");

        emit StakeReleased(stakeId, stake.staker, stake.amount, msg.sender);
    }

    function getTask(bytes32 taskId) external view returns (Task memory) {
        return _requireTask(taskId);
    }

    function getCorrection(uint256 correctionId) external view returns (Correction memory) {
        return _requireCorrection(correctionId);
    }

    function getCorrectionsForTask(bytes32 taskId) external view returns (uint256[] memory) {
        _requireTask(taskId);
        return taskCorrectionIds[taskId];
    }

    function getDatasetVersion(bytes32 datasetId, uint256 version)
        external
        view
        returns (DatasetVersion memory)
    {
        _requireDatasetId(datasetId);

        DatasetVersion memory datasetVersion = datasetVersions[datasetId][version];
        if (!datasetVersion.exists) {
            revert DatasetVersionNotFound(datasetId, version);
        }

        return datasetVersion;
    }

    function getStake(uint256 stakeId) external view returns (Stake memory) {
        return _requireStake(stakeId);
    }

    function _createStakeForTask(bytes32 taskId, address staker, uint256 amount)
        internal
        returns (uint256 stakeId)
    {
        stakeId = nextStakeId++;
        uint64 lockedAt = uint64(block.timestamp);

        stakes[stakeId] = Stake({
            id: stakeId,
            staker: staker,
            referenceType: StakeReferenceType.Task,
            taskId: taskId,
            correctionId: 0,
            amount: amount,
            lockedAt: lockedAt,
            released: false
        });

        tasks[taskId].totalStake += amount;

        emit StakeDeposited(stakeId, staker, StakeReferenceType.Task, taskId, 0, amount, lockedAt);
    }

    function _createStakeForCorrection(
        Task storage task,
        uint256 correctionId,
        address staker,
        uint256 amount
    ) internal returns (uint256 stakeId) {
        stakeId = nextStakeId++;
        uint64 lockedAt = uint64(block.timestamp);
        bytes32 taskId = corrections[correctionId].taskId;

        stakes[stakeId] = Stake({
            id: stakeId,
            staker: staker,
            referenceType: StakeReferenceType.Correction,
            taskId: taskId,
            correctionId: correctionId,
            amount: amount,
            lockedAt: lockedAt,
            released: false
        });

        task.totalStake += amount;
        corrections[correctionId].totalStake += amount;

        emit StakeDeposited(
            stakeId,
            staker,
            StakeReferenceType.Correction,
            taskId,
            correctionId,
            amount,
            lockedAt
        );
    }

    function _requireTask(bytes32 taskId) internal view returns (Task storage task) {
        _requireTaskId(taskId);

        task = tasks[taskId];
        if (!task.exists) {
            revert TaskNotFound(taskId);
        }
    }

    function _requireCorrection(uint256 correctionId) internal view returns (Correction storage correction) {
        correction = corrections[correctionId];
        if (!correction.exists) {
            revert CorrectionNotFound(correctionId);
        }
    }

    function _requireStake(uint256 stakeId) internal view returns (Stake storage stake) {
        stake = stakes[stakeId];
        if (stake.id == 0) {
            revert StakeNotFound(stakeId);
        }
    }

    function _requireTaskId(bytes32 taskId) internal pure {
        if (taskId == bytes32(0)) {
            revert InvalidTaskId();
        }
    }

    function _requireDatasetId(bytes32 datasetId) internal pure {
        if (datasetId == bytes32(0)) {
            revert InvalidDatasetId();
        }
    }

    function _requireMetadataReference(string calldata metadataURI, bytes32 metadataHash) internal pure {
        if (bytes(metadataURI).length == 0 && metadataHash == bytes32(0)) {
            revert MissingMetadataReference();
        }
    }
}
