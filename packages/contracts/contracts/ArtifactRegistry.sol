// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ArtifactRegistry
/// @notice Legacy EVM registry for agent artifacts backed by Walrus storage references.
contract ArtifactRegistry {
    error InvalidArtifactId();
    error MissingArtifactReference();
    error ArtifactAlreadyExists(bytes32 artifactId);
    error ArtifactNotFound(bytes32 artifactId);
    error Unauthorized();

    struct Artifact {
        bytes32 id;
        address creator;
        uint64 createdAt;
        uint64 updatedAt;
        uint64 version;
        string metadataURI;
        bytes32 metadataHash;
        string storageURI;
        bytes32 storageHash;
        bool exists;
    }

    event ArtifactCreated(
        bytes32 indexed artifactId,
        address indexed creator,
        uint64 timestamp,
        uint64 version,
        string metadataURI,
        bytes32 metadataHash,
        string storageURI,
        bytes32 storageHash
    );

    event ArtifactUpdated(
        bytes32 indexed artifactId,
        address indexed creator,
        uint64 timestamp,
        uint64 version,
        string metadataURI,
        bytes32 metadataHash,
        string storageURI,
        bytes32 storageHash
    );

    uint256 public nextArtifactNonce = 1;

    bytes32[] private artifactIds;
    mapping(bytes32 => Artifact) private artifacts;
    mapping(address => bytes32[]) private artifactIdsByCreator;

    function createArtifact(
        string calldata metadataURI,
        bytes32 metadataHash,
        string calldata storageURI,
        bytes32 storageHash
    ) external returns (bytes32 artifactId) {
        _requireArtifactReference(metadataURI, metadataHash, storageURI, storageHash);

        uint256 nonce = nextArtifactNonce++;
        artifactId = computeArtifactId(msg.sender, nonce, metadataURI, metadataHash, storageURI, storageHash);

        if (artifacts[artifactId].exists) {
            revert ArtifactAlreadyExists(artifactId);
        }

        uint64 timestamp = uint64(block.timestamp);
        artifacts[artifactId] = Artifact({
            id: artifactId,
            creator: msg.sender,
            createdAt: timestamp,
            updatedAt: timestamp,
            version: 1,
            metadataURI: metadataURI,
            metadataHash: metadataHash,
            storageURI: storageURI,
            storageHash: storageHash,
            exists: true
        });
        artifactIds.push(artifactId);
        artifactIdsByCreator[msg.sender].push(artifactId);

        emit ArtifactCreated(
            artifactId,
            msg.sender,
            timestamp,
            1,
            metadataURI,
            metadataHash,
            storageURI,
            storageHash
        );
    }

    function updateArtifact(
        bytes32 artifactId,
        string calldata metadataURI,
        bytes32 metadataHash,
        string calldata storageURI,
        bytes32 storageHash
    ) external returns (uint64 version) {
        _requireArtifactId(artifactId);
        _requireArtifactReference(metadataURI, metadataHash, storageURI, storageHash);

        Artifact storage artifact = artifacts[artifactId];
        if (!artifact.exists) {
            revert ArtifactNotFound(artifactId);
        }

        if (artifact.creator != msg.sender) {
            revert Unauthorized();
        }

        version = artifact.version + 1;
        uint64 timestamp = uint64(block.timestamp);

        artifact.updatedAt = timestamp;
        artifact.version = version;
        artifact.metadataURI = metadataURI;
        artifact.metadataHash = metadataHash;
        artifact.storageURI = storageURI;
        artifact.storageHash = storageHash;

        emit ArtifactUpdated(
            artifactId,
            msg.sender,
            timestamp,
            version,
            metadataURI,
            metadataHash,
            storageURI,
            storageHash
        );
    }

    function computeArtifactId(
        address creator,
        uint256 nonce,
        string calldata metadataURI,
        bytes32 metadataHash,
        string calldata storageURI,
        bytes32 storageHash
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                block.chainid,
                address(this),
                creator,
                nonce,
                metadataURI,
                metadataHash,
                storageURI,
                storageHash
            )
        );
    }

    function artifactCount() external view returns (uint256) {
        return artifactIds.length;
    }

    function getArtifactIdAt(uint256 index) external view returns (bytes32) {
        return artifactIds[index];
    }

    function getArtifact(bytes32 artifactId) external view returns (Artifact memory) {
        Artifact memory artifact = artifacts[artifactId];
        if (!artifact.exists) {
            revert ArtifactNotFound(artifactId);
        }

        return artifact;
    }

    function getArtifactsByCreator(address creator) external view returns (bytes32[] memory) {
        return artifactIdsByCreator[creator];
    }

    function _requireArtifactId(bytes32 artifactId) private pure {
        if (artifactId == bytes32(0)) {
            revert InvalidArtifactId();
        }
    }

    function _requireArtifactReference(
        string calldata metadataURI,
        bytes32 metadataHash,
        string calldata storageURI,
        bytes32 storageHash
    ) private pure {
        bool hasMetadata = bytes(metadataURI).length > 0 || metadataHash != bytes32(0);
        bool hasStorage = bytes(storageURI).length > 0 || storageHash != bytes32(0);

        if (!hasMetadata && !hasStorage) {
            revert MissingArtifactReference();
        }
    }
}
