module neura::artifact_registry {
    use std::string::String;
    use sui::event;
    use sui::table::{Self, Table};

    const E_NOT_CREATOR: u64 = 1;
    const E_ARTIFACT_NOT_FOUND: u64 = 2;

    public struct ArtifactRegistry has key {
        id: UID,
        artifact_count: u64,
        artifact_ids: vector<ID>,
        creators: Table<ID, address>,
    }

    public struct Artifact has key, store {
        id: UID,
        external_id: String,
        creator: address,
        metadata_uri: String,
        metadata_hash: vector<u8>,
        storage_uri: String,
        storage_hash: vector<u8>,
        version: u64,
        created_at_epoch: u64,
        updated_at_epoch: u64,
    }

    public struct ArtifactCreated has copy, drop {
        artifact_id: ID,
        creator: address,
        metadata_uri: String,
        storage_uri: String,
        version: u64,
    }

    public struct ArtifactUpdated has copy, drop {
        artifact_id: ID,
        creator: address,
        new_version: u64,
        metadata_uri: String,
        storage_uri: String,
    }

    fun init(ctx: &mut TxContext) {
        transfer::share_object(ArtifactRegistry {
            id: object::new(ctx),
            artifact_count: 0,
            artifact_ids: vector[],
            creators: table::new(ctx),
        });
    }

    public fun create_artifact(
        metadata_uri: String,
        metadata_hash: vector<u8>,
        storage_uri: String,
        storage_hash: vector<u8>,
        registry: &mut ArtifactRegistry,
        ctx: &mut TxContext,
    ): ID {
        let creator = tx_context::sender(ctx);
        let artifact = Artifact {
            id: object::new(ctx),
            external_id: std::string::utf8(b""),
            creator,
            metadata_uri,
            metadata_hash,
            storage_uri,
            storage_hash,
            version: 1,
            created_at_epoch: tx_context::epoch(ctx),
            updated_at_epoch: tx_context::epoch(ctx),
        };
        let artifact_id = object::uid_to_inner(&artifact.id);

        table::add(&mut registry.creators, artifact_id, creator);
        registry.artifact_ids.push_back(artifact_id);
        registry.artifact_count = registry.artifact_count + 1;
        transfer::share_object(artifact);

        event::emit(ArtifactCreated {
            artifact_id,
            creator,
            metadata_uri,
            storage_uri,
            version: 1,
        });
        artifact_id
    }

    /// Creates a Neon-backed artifact. The chain stores identity and integrity;
    /// artifact content remains in the application database for indexed retrieval.
    public fun create_neon_artifact(
        external_id: String,
        content_hash: vector<u8>,
        registry: &mut ArtifactRegistry,
        ctx: &mut TxContext,
    ): ID {
        let creator = tx_context::sender(ctx);
        let empty_metadata = std::string::utf8(b"");
        let empty_storage = std::string::utf8(b"");
        let artifact = Artifact {
            id: object::new(ctx),
            external_id,
            creator,
            metadata_uri: empty_metadata,
            metadata_hash: content_hash,
            storage_uri: empty_storage,
            storage_hash: vector[],
            version: 1,
            created_at_epoch: tx_context::epoch(ctx),
            updated_at_epoch: tx_context::epoch(ctx),
        };
        let artifact_id = object::uid_to_inner(&artifact.id);
        table::add(&mut registry.creators, artifact_id, creator);
        registry.artifact_ids.push_back(artifact_id);
        registry.artifact_count = registry.artifact_count + 1;
        transfer::share_object(artifact);
        artifact_id
    }

    public fun update_artifact(
        artifact: &mut Artifact,
        metadata_uri: String,
        metadata_hash: vector<u8>,
        storage_uri: String,
        storage_hash: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == artifact.creator, E_NOT_CREATOR);

        artifact.version = artifact.version + 1;
        artifact.metadata_uri = metadata_uri;
        artifact.metadata_hash = metadata_hash;
        artifact.storage_uri = storage_uri;
        artifact.storage_hash = storage_hash;
        artifact.updated_at_epoch = tx_context::epoch(ctx);

        event::emit(ArtifactUpdated {
            artifact_id: object::uid_to_inner(&artifact.id),
            creator: artifact.creator,
            new_version: artifact.version,
            metadata_uri,
            storage_uri,
        });
    }

    public fun get_artifact_count(registry: &ArtifactRegistry): u64 {
        registry.artifact_count
    }

    public fun get_artifact_ids(registry: &ArtifactRegistry): &vector<ID> {
        &registry.artifact_ids
    }

    public fun get_creator(registry: &ArtifactRegistry, artifact_id: ID): address {
        assert!(table::contains(&registry.creators, artifact_id), E_ARTIFACT_NOT_FOUND);
        *table::borrow(&registry.creators, artifact_id)
    }

    public fun artifact_id(artifact: &Artifact): ID {
        object::uid_to_inner(&artifact.id)
    }

    public fun artifact_creator(artifact: &Artifact): address {
        artifact.creator
    }

    public fun artifact_external_id(artifact: &Artifact): &String {
        &artifact.external_id
    }

    public fun artifact_version(artifact: &Artifact): u64 {
        artifact.version
    }

    public fun artifact_metadata_uri(artifact: &Artifact): &String {
        &artifact.metadata_uri
    }

    public fun artifact_storage_uri(artifact: &Artifact): &String {
        &artifact.storage_uri
    }

    public fun created_artifact_id(created: &ArtifactCreated): ID {
        created.artifact_id
    }

    public fun created_version(created: &ArtifactCreated): u64 {
        created.version
    }

    public fun updated_artifact_id(updated: &ArtifactUpdated): ID {
        updated.artifact_id
    }

    public fun updated_version(updated: &ArtifactUpdated): u64 {
        updated.new_version
    }

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx)
    }
}
