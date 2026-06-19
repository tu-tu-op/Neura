#[test_only]
module neura::artifact_registry_tests {
    use std::string;
    use neura::artifact_registry::{Self, Artifact, ArtifactCreated, ArtifactRegistry};
    use neura::artifact_registry::ArtifactUpdated;
    use sui::event;
    use sui::test_scenario;

    const CREATOR: address = @0xA11CE;
    const OTHER_USER: address = @0xB0B;

    #[test]
    fun test_init() {
        let mut scenario = test_scenario::begin(CREATOR);
        artifact_registry::init_for_testing(scenario.ctx());

        scenario.next_tx(CREATOR);
        let registry = scenario.take_shared<ArtifactRegistry>();
        assert!(artifact_registry::get_artifact_count(&registry) == 0);
        assert!(artifact_registry::get_artifact_ids(&registry).is_empty());
        test_scenario::return_shared(registry);
        scenario.end();
    }

    #[test]
    fun test_create_artifact() {
        let mut scenario = test_scenario::begin(CREATOR);
        artifact_registry::init_for_testing(scenario.ctx());

        scenario.next_tx(CREATOR);
        let mut registry = scenario.take_shared<ArtifactRegistry>();
        let artifact_id = artifact_registry::create_artifact(
            string::utf8(b"walrus://metadata"),
            b"metadata-hash",
            string::utf8(b"walrus://blob"),
            b"blob-hash",
            &mut registry,
            scenario.ctx(),
        );
        assert!(artifact_registry::get_artifact_count(&registry) == 1);
        assert!(artifact_registry::get_artifact_ids(&registry)[0] == artifact_id);
        assert!(artifact_registry::get_creator(&registry, artifact_id) == CREATOR);

        let events = event::events_by_type<ArtifactCreated>();
        assert!(events.length() == 1);
        assert!(artifact_registry::created_artifact_id(&events[0]) == artifact_id);
        assert!(artifact_registry::created_version(&events[0]) == 1);
        test_scenario::return_shared(registry);

        scenario.next_tx(CREATOR);
        let artifact = scenario.take_shared<Artifact>();
        assert!(artifact_registry::artifact_id(&artifact) == artifact_id);
        assert!(artifact_registry::artifact_creator(&artifact) == CREATOR);
        assert!(artifact_registry::artifact_version(&artifact) == 1);
        test_scenario::return_shared(artifact);
        scenario.end();
    }

    #[test]
    fun test_update_artifact() {
        let mut scenario = test_scenario::begin(CREATOR);
        artifact_registry::init_for_testing(scenario.ctx());

        scenario.next_tx(CREATOR);
        let mut registry = scenario.take_shared<ArtifactRegistry>();
        let artifact_id = artifact_registry::create_artifact(
            string::utf8(b"walrus://metadata-v1"),
            b"metadata-hash-v1",
            string::utf8(b"walrus://blob-v1"),
            b"blob-hash-v1",
            &mut registry,
            scenario.ctx(),
        );
        test_scenario::return_shared(registry);

        scenario.next_tx(CREATOR);
        let mut artifact = scenario.take_shared<Artifact>();
        let new_metadata_uri = string::utf8(b"walrus://metadata-v2");
        let new_storage_uri = string::utf8(b"walrus://blob-v2");
        artifact_registry::update_artifact(
            &mut artifact,
            new_metadata_uri,
            b"metadata-hash-v2",
            new_storage_uri,
            b"blob-hash-v2",
            scenario.ctx(),
        );
        assert!(artifact_registry::artifact_version(&artifact) == 2);
        assert!(*artifact_registry::artifact_metadata_uri(&artifact) == new_metadata_uri);
        assert!(*artifact_registry::artifact_storage_uri(&artifact) == new_storage_uri);

        let events = event::events_by_type<ArtifactUpdated>();
        assert!(events.length() == 1);
        assert!(artifact_registry::updated_artifact_id(&events[0]) == artifact_id);
        assert!(artifact_registry::updated_version(&events[0]) == 2);
        test_scenario::return_shared(artifact);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = 1, location = artifact_registry)]
    fun test_update_artifact_not_creator_aborts() {
        let mut scenario = test_scenario::begin(CREATOR);
        artifact_registry::init_for_testing(scenario.ctx());

        scenario.next_tx(CREATOR);
        let mut registry = scenario.take_shared<ArtifactRegistry>();
        artifact_registry::create_artifact(
            string::utf8(b"walrus://metadata-v1"),
            b"metadata-hash-v1",
            string::utf8(b"walrus://blob-v1"),
            b"blob-hash-v1",
            &mut registry,
            scenario.ctx(),
        );
        test_scenario::return_shared(registry);

        scenario.next_tx(OTHER_USER);
        let mut artifact = scenario.take_shared<Artifact>();
        artifact_registry::update_artifact(
            &mut artifact,
            string::utf8(b"walrus://unauthorized-metadata"),
            b"unauthorized-metadata-hash",
            string::utf8(b"walrus://unauthorized-blob"),
            b"unauthorized-blob-hash",
            scenario.ctx(),
        );
        abort 0
    }
}
